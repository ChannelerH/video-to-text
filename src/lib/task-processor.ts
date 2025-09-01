import { TranscriptionService } from './transcription';
import { taskQueue } from './task-queue';

export class TaskProcessor {
  private transcriptionService: TranscriptionService;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(replicateApiToken: string) {
    this.transcriptionService = new TranscriptionService(replicateApiToken);
  }

  /**
   * 启动任务处理器
   */
  start(): void {
    if (this.processingInterval) {
      return;
    }

    // 每 5 秒检查一次待处理任务
    this.processingInterval = setInterval(() => {
      this.processPendingTasks();
    }, 5000);

    // 立即处理一次
    this.processPendingTasks();
  }

  /**
   * 停止任务处理器
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * 处理待处理任务
   */
  private async processPendingTasks(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    const pendingTasks = taskQueue.getPendingTasks();
    if (pendingTasks.length === 0) {
      return;
    }

    this.isProcessing = true;

    for (const task of pendingTasks) {
      try {
        // 更新任务状态为处理中
        taskQueue.updateTask(task.id, { status: 'processing' });

        // 处理转录任务
        const result = await this.transcriptionService.processTranscription(task.request);

        // 更新任务结果
        if (result.success) {
          taskQueue.completeTask(task.id, result);
        } else {
          taskQueue.failTask(task.id, result.error || 'Unknown error');
        }
      } catch (error) {
        console.error(`Error processing task ${task.id}:`, error);
        taskQueue.failTask(
          task.id,
          error instanceof Error ? error.message : 'Processing failed'
        );
      }
    }

    this.isProcessing = false;
  }

  /**
   * 立即处理特定任务（用于优先处理）
   */
  async processTaskImmediately(taskId: string): Promise<void> {
    const task = taskQueue.getTask(taskId);
    if (!task || task.status !== 'pending') {
      return;
    }

    try {
      taskQueue.updateTask(taskId, { status: 'processing' });
      const result = await this.transcriptionService.processTranscription(task.request);
      
      if (result.success) {
        taskQueue.completeTask(taskId, result);
      } else {
        taskQueue.failTask(taskId, result.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      taskQueue.failTask(
        taskId,
        error instanceof Error ? error.message : 'Processing failed'
      );
    }
  }
}

// 创建全局任务处理器实例
let globalProcessor: TaskProcessor | null = null;

export function getTaskProcessor(): TaskProcessor {
  if (!globalProcessor) {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }
    globalProcessor = new TaskProcessor(apiToken);
    globalProcessor.start();
  }
  return globalProcessor;
}