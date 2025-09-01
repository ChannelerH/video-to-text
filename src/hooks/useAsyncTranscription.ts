import { useState, useCallback, useEffect, useRef } from 'react';

interface AsyncTranscriptionOptions {
  onProgress?: (progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  pollInterval?: number; // 轮询间隔，默认 2 秒
}

interface AsyncTranscriptionState {
  taskId: string | null;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result: any | null;
  error: string | null;
}

export function useAsyncTranscription(options: AsyncTranscriptionOptions = {}) {
  const { 
    onProgress, 
    onComplete, 
    onError, 
    pollInterval = 2000 
  } = options;

  const [state, setState] = useState<AsyncTranscriptionState>({
    taskId: null,
    status: 'idle',
    progress: 0,
    result: null,
    error: null
  });

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // 清理轮询
  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 检查任务状态
  const checkTaskStatus = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/transcribe-async?taskId=${taskId}`);
      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.success && data.task) {
        const { status, progress, result, error } = data.task;

        setState(prev => ({
          ...prev,
          status,
          progress: progress || 0,
          result: result || null,
          error: error || null
        }));

        // 触发进度回调
        if (progress && onProgress) {
          onProgress(progress);
        }

        // 任务完成
        if (status === 'completed') {
          clearPolling();
          if (result && onComplete) {
            onComplete(result);
          }
        }

        // 任务失败
        if (status === 'failed') {
          clearPolling();
          if (error && onError) {
            onError(error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check task status:', error);
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: 'Failed to check task status'
        }));
        clearPolling();
        if (onError) {
          onError('Failed to check task status');
        }
      }
    }
  }, [clearPolling, onProgress, onComplete, onError]);

  // 启动异步转录
  const startTranscription = useCallback(async (
    type: 'youtube_url' | 'file_upload',
    content: string,
    transcriptionOptions?: any
  ) => {
    try {
      // 重置状态
      setState({
        taskId: null,
        status: 'pending',
        progress: 0,
        result: null,
        error: null
      });

      // 创建异步任务
      const response = await fetch('/api/transcribe-async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          content,
          options: transcriptionOptions
        })
      });

      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.success && data.taskId) {
        setState(prev => ({
          ...prev,
          taskId: data.taskId,
          status: 'processing'
        }));

        // 开始轮询任务状态
        pollingRef.current = setInterval(() => {
          checkTaskStatus(data.taskId);
        }, pollInterval);

        // 立即检查一次
        checkTaskStatus(data.taskId);

        return data.taskId;
      } else {
        throw new Error(data.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('Failed to start transcription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start transcription';
      
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'failed',
          error: errorMessage
        }));
        
        if (onError) {
          onError(errorMessage);
        }
      }
      
      throw error;
    }
  }, [checkTaskStatus, pollInterval, onError]);

  // 取消任务
  const cancelTask = useCallback(() => {
    clearPolling();
    setState({
      taskId: null,
      status: 'idle',
      progress: 0,
      result: null,
      error: null
    });
  }, [clearPolling]);

  // 组件卸载时清理
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      clearPolling();
    };
  }, [clearPolling]);

  return {
    ...state,
    startTranscription,
    cancelTask,
    isLoading: state.status === 'pending' || state.status === 'processing',
    isCompleted: state.status === 'completed',
    isFailed: state.status === 'failed'
  };
}