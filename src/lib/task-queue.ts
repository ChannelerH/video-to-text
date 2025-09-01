import { v4 as uuidv4 } from 'uuid';
import { TranscriptionRequest, TranscriptionResponse } from './transcription';

export interface Task {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  request: TranscriptionRequest;
  result?: TranscriptionResponse;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  progress?: number;
}

class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private readonly TASK_TTL = 3600000; // 1 hour in milliseconds

  /**
   * 创建新任务
   */
  createTask(request: TranscriptionRequest): string {
    const taskId = uuidv4();
    const task: Task = {
      id: taskId,
      status: 'pending',
      request,
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0
    };
    
    this.tasks.set(taskId, task);
    this.cleanupOldTasks();
    
    return taskId;
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 更新任务状态
   */
  updateTask(taskId: string, updates: Partial<Task>): void {
    const task = this.tasks.get(taskId);
    if (task) {
      Object.assign(task, updates, { updatedAt: new Date() });
      this.tasks.set(taskId, task);
    }
  }

  /**
   * 更新任务进度
   */
  updateProgress(taskId: string, progress: number): void {
    this.updateTask(taskId, { progress });
  }

  /**
   * 标记任务完成
   */
  completeTask(taskId: string, result: TranscriptionResponse): void {
    this.updateTask(taskId, {
      status: 'completed',
      result,
      progress: 100
    });
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, error: string): void {
    this.updateTask(taskId, {
      status: 'failed',
      error
    });
  }

  /**
   * 清理过期任务
   */
  private cleanupOldTasks(): void {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (now - task.createdAt.getTime() > this.TASK_TTL) {
        this.tasks.delete(taskId);
      }
    }
  }

  /**
   * 获取待处理任务
   */
  getPendingTasks(): Task[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

// 导出单例
export const taskQueue = new TaskQueue();