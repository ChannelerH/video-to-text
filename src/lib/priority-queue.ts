/**
 * Priority Queue System for Transcription Jobs
 * Pro/Premium users get higher priority processing
 */

import { UserTier } from '@/services/user-tier';

export interface QueueJob {
  id: string;
  userId?: string;
  userTier: UserTier;
  priority: number;
  createdAt: Date;
  type: 'transcription' | 'chapter_generation' | 'summary';
  data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PriorityQueueManager {
  private static queue: QueueJob[] = [];
  private static processing = false;
  
  // Priority scores for different tiers
  private static readonly TIER_PRIORITY = {
    [UserTier.FREE]: 0,
    [UserTier.BASIC]: 5,
    [UserTier.PRO]: 10,
    [UserTier.PREMIUM]: 15
  };

  // Additional priority boosts
  private static readonly TYPE_PRIORITY = {
    transcription: 0,
    chapter_generation: -1, // Slightly lower priority
    summary: -2 // Lowest priority
  };

  /**
   * Add a job to the priority queue
   */
  static addJob(job: Omit<QueueJob, 'id' | 'createdAt' | 'priority'>): string {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const priority = this.calculatePriority(job.userTier, job.type);
    
    const queueJob: QueueJob = {
      ...job,
      id,
      priority,
      createdAt: new Date(),
      status: 'pending'
    };

    // Insert job in priority order
    const insertIndex = this.queue.findIndex(j => j.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(queueJob);
    } else {
      this.queue.splice(insertIndex, 0, queueJob);
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return id;
  }

  /**
   * Calculate priority score for a job
   */
  private static calculatePriority(userTier: UserTier, type: QueueJob['type']): number {
    const tierPriority = this.TIER_PRIORITY[userTier];
    const typePriority = this.TYPE_PRIORITY[type];
    
    // Add time-based decay to prevent starvation (older jobs get slight boost)
    const ageBoost = 0; // Will be calculated when comparing jobs
    
    return tierPriority + typePriority + ageBoost;
  }

  /**
   * Process jobs from the queue
   */
  private static async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Re-sort queue with age boost to prevent starvation
      this.queue.sort((a, b) => {
        const ageA = (Date.now() - a.createdAt.getTime()) / 60000; // Minutes waiting
        const ageB = (Date.now() - b.createdAt.getTime()) / 60000;
        
        // Add 0.1 priority per minute waiting (prevents starvation)
        const priorityA = a.priority + Math.min(ageA * 0.1, 5); // Cap at 5 bonus
        const priorityB = b.priority + Math.min(ageB * 0.1, 5);
        
        return priorityB - priorityA; // Higher priority first
      });

      const job = this.queue.shift();
      if (!job) break;

      job.status = 'processing';
      
      try {
        await this.processJob(job);
        job.status = 'completed';
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        job.status = 'failed';
      }
    }

    this.processing = false;
  }

  /**
   * Process a single job
   */
  private static async processJob(job: QueueJob): Promise<void> {
    // This is where the actual processing would happen
    // For now, we'll just simulate processing time
    console.log(`Processing ${job.type} job ${job.id} for ${job.userTier} user`);
    
    // Simulate processing time based on job type
    const processingTime = {
      transcription: 5000,
      chapter_generation: 2000,
      summary: 1000
    };
    
    await new Promise(resolve => setTimeout(resolve, processingTime[job.type]));
  }

  /**
   * Get job status
   */
  static getJobStatus(jobId: string): QueueJob | undefined {
    return this.queue.find(j => j.id === jobId);
  }

  /**
   * Get queue position for a job
   */
  static getQueuePosition(jobId: string): number {
    const index = this.queue.findIndex(j => j.id === jobId && j.status === 'pending');
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Get estimated wait time for a user tier
   */
  static getEstimatedWaitTime(userTier: UserTier): number {
    // Count jobs ahead based on priority
    const userPriority = this.TIER_PRIORITY[userTier];
    const jobsAhead = this.queue.filter(j => 
      j.status === 'pending' && j.priority >= userPriority
    ).length;
    
    // Estimate 10 seconds per job (rough estimate)
    return jobsAhead * 10;
  }

  /**
   * Cancel a job
   */
  static cancelJob(jobId: string, userId?: string): boolean {
    const index = this.queue.findIndex(j => 
      j.id === jobId && 
      j.status === 'pending' &&
      (!userId || j.userId === userId)
    );
    
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Get queue statistics
   */
  static getQueueStats() {
    const stats = {
      total: this.queue.length,
      pending: this.queue.filter(j => j.status === 'pending').length,
      processing: this.queue.filter(j => j.status === 'processing').length,
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
      byTier: {
        [UserTier.FREE]: 0,
        [UserTier.BASIC]: 0,
        [UserTier.PRO]: 0,
        [UserTier.PREMIUM]: 0
      }
    };

    this.queue.forEach(job => {
      stats.byTier[job.userTier]++;
    });

    return stats;
  }
}