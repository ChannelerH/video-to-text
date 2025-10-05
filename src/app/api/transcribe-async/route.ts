import { NextRequest, NextResponse } from 'next/server';
import { taskQueue } from '@/lib/task-queue';
import { getTaskProcessor } from '@/lib/task-processor';
import { TranscriptionRequest } from '@/lib/transcription';
import { readJson } from '@/lib/read-json';

// 创建异步任务
export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ type?: string; content?: string; options?: Record<string, any> }>(request);
    const { type, content, options = {} } = body;

    const isValidType = (value: unknown): value is TranscriptionRequest['type'] =>
      typeof value === 'string' && ['youtube_url', 'file_upload', 'audio_url'].includes(value);

    // 验证必需参数
    if (!type || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: type and content' },
        { status: 400 }
      );
    }

    // 验证类型
    if (!isValidType(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be youtube_url, file_upload, or audio_url' },
        { status: 400 }
      );
    }

    // 创建任务
    const transcriptionRequest: TranscriptionRequest = {
      type,
      content,
      options
    };

    const taskId = taskQueue.createTask(transcriptionRequest);

    // 在后台启动任务处理（不等待完成）
    const processor = getTaskProcessor();
    processor.processTaskImmediately(taskId).catch(error => {
      console.error(`Failed to process task ${taskId}:`, error);
    });

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      taskId,
      message: 'Task created successfully. Use the task ID to check status.'
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// 获取任务状态
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'Missing taskId parameter' },
        { status: 400 }
      );
    }

    const task = taskQueue.getTask(taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // 返回任务状态和结果
    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        result: task.result,
        error: task.error
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
