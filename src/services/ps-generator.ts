import { sql } from 'drizzle-orm';
import { db } from '@/db';

export class PersonalizedPSGenerator {
  /**
   * Generate personalized postscript based on user activity
   */
  async generatePS(userUuid: string): Promise<string> {
    try {
      // Get user's recent activity
      const [recentTranscriptions, recentFeedback, totalMinutesUsed] = await Promise.all([
        this.getRecentTranscriptions(userUuid),
        this.getRecentFeedback(userUuid),
        this.getTotalMinutesUsed(userUuid)
      ]);
      
      // Generate PS based on actual activity
      if (recentFeedback.length > 0) {
        const feedback = recentFeedback[0];
        if (feedback.status === 'implemented') {
          return `P.S. Remember that feature you suggested? It's now live! Check it out.`;
        } else if (feedback.status === 'in_progress') {
          return `P.S. Your recent feedback is being worked on. We'll notify you once it's ready!`;
        }
      }
      
      if (recentTranscriptions.length > 0) {
        const count = recentTranscriptions.length;
        const lastTitle = recentTranscriptions[0].title || 'your content';
        
        if (count === 1) {
          return `P.S. Hope your transcription of "${this.truncateTitle(lastTitle)}" was helpful!`;
        } else {
          return `P.S. You've transcribed ${count} files this week - that's impressive productivity!`;
        }
      }
      
      if (totalMinutesUsed > 0) {
        if (totalMinutesUsed < 10) {
          return `P.S. You've used ${totalMinutesUsed.toFixed(1)} minutes so far. Try transcribing a YouTube video - it's super easy!`;
        } else if (totalMinutesUsed < 60) {
          return `P.S. You've already saved hours by transcribing ${totalMinutesUsed.toFixed(0)} minutes of content!`;
        } else {
          const hours = Math.floor(totalMinutesUsed / 60);
          return `P.S. Amazing! You've transcribed over ${hours} hours of content. You're a power user!`;
        }
      }
      
      // Default PS for new users with no activity
      const tips = [
        `P.S. Did you know you can transcribe YouTube videos directly? Just paste the URL!`,
        `P.S. Our high-accuracy model is perfect for technical content and podcasts.`,
        `P.S. You can export transcripts in multiple formats - SRT, VTT, TXT, and more!`,
        `P.S. Try our new batch upload feature to transcribe multiple files at once.`
      ];
      
      // Random tip for inactive users
      return tips[Math.floor(Math.random() * tips.length)];
      
    } catch (error) {
      console.error('Failed to generate personalized PS:', error);
      // Return a safe default
      return `P.S. We're constantly adding new features based on user feedback!`;
    }
  }
  
  /**
   * Get user's recent transcriptions
   */
  private async getRecentTranscriptions(userUuid: string) {
    const result = await db().execute(
      sql`SELECT job_id, title, created_at, duration_sec
         FROM v2tx_transcriptions 
         WHERE user_uuid = ${userUuid}
         AND created_at > NOW() - INTERVAL '7 days'
         AND deleted = false
         ORDER BY created_at DESC
         LIMIT 5`
    );
    
    return result as any[];
  }
  
  /**
   * Get user's recent feedback
   */
  private async getRecentFeedback(userUuid: string) {
    const result = await db().execute(
      sql`SELECT id, feedback_type, status, created_at, implemented_at
         FROM v2tx_user_feedback
         WHERE user_uuid = ${userUuid}
         ORDER BY created_at DESC
         LIMIT 3`
    );
    
    return result as any[];
  }
  
  /**
   * Get total minutes used by user
   */
  private async getTotalMinutesUsed(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT COALESCE(SUM(cost_minutes), 0) as total
         FROM v2tx_transcriptions
         WHERE user_uuid = ${userUuid}
         AND deleted = false`
    );
    
    return Number((result as any[])[0]?.total || 0);
  }
  
  /**
   * Truncate long titles for PS
   */
  private truncateTitle(title: string, maxLength: number = 30): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Generate PS for specific campaign types
   */
  async generateCampaignPS(userUuid: string, campaignType: string): Promise<string> {
    switch (campaignType) {
      case 'day3_activation':
      case 'day_3_activation':
        const minutesLeft = await this.getUserMinutesBalance(userUuid);
        if (minutesLeft > 0) {
          return `P.S. You still have ${minutesLeft} minutes remaining - use them before they expire!`;
        }
        return `P.S. Your bonus minutes are waiting - transcribe something amazing today!`;
        
      case 'day7_feedback':
      case 'day_7_feedback':
        const transcriptionCount = await this.getTranscriptionCount(userUuid);
        if (transcriptionCount > 3) {
          return `P.S. You're already a power user with ${transcriptionCount} transcriptions!`;
        }
        return `P.S. Every piece of feedback helps us build the perfect tool for you.`;
        
      case 'paid_user_feedback':
        return `P.S. As a valued premium user, your feedback gets priority implementation.`;
        
      case 'win_back':
        const daysSinceLastUse = await this.getDaysSinceLastUse(userUuid);
        if (daysSinceLastUse > 30) {
          return `P.S. We've added tons of new features since you last visited!`;
        }
        return `P.S. Come back and see what's new - we think you'll love the improvements!`;
        
      default:
        return this.generatePS(userUuid);
    }
  }
  
  /**
   * Get user's current minute balance
   */
  private async getUserMinutesBalance(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT COALESCE(SUM(minutes_left), 0) as balance
         FROM v2tx_minute_packs
         WHERE user_id = ${userUuid}
         AND minutes_left > 0
         AND (expires_at IS NULL OR expires_at > NOW())`
    );
    
    return Number((result as any[])[0]?.balance || 0);
  }
  
  /**
   * Get user's total transcription count
   */
  private async getTranscriptionCount(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT COUNT(*) as count
         FROM v2tx_transcriptions
         WHERE user_uuid = ${userUuid}
         AND deleted = false`
    );
    
    return Number((result as any[])[0]?.count || 0);
  }
  
  /**
   * Get days since user's last activity
   */
  private async getDaysSinceLastUse(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT EXTRACT(DAY FROM NOW() - MAX(created_at)) as days
         FROM v2tx_transcriptions
         WHERE user_uuid = ${userUuid}`
    );
    
    return Number((result as any[])[0]?.days || 0);
  }
}
