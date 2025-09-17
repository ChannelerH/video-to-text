/**
 * API 调用工具函数，包含超时和重试机制
 */

export interface ApiCallOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 30000; // 30秒
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1秒

/**
 * 带重试机制的 API 调用
 */
export async function callApiWithRetry(
  url: string,
  options: RequestInit & ApiCallOptions = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    onError,
    signal,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 创建超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 合并外部信号和超时信号
      const combinedSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      const response = await fetch(url, {
        ...fetchOptions,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      // 如果是服务器错误（5xx），可能需要重试
      if (response.status >= 500 && attempt < retries) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // 如果是用户取消，直接抛出
      if (lastError.name === 'AbortError' && signal?.aborted) {
        throw lastError;
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === retries) {
        onError?.(lastError);
        throw lastError;
      }

      // 指数退避重试延迟
      const delay = retryDelay * Math.pow(2, attempt);
      console.log(`[API] Retry attempt ${attempt + 1}/${retries} after ${delay}ms for ${url}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Failed to call API');
}

/**
 * 轮询状态检查
 */
export interface PollOptions {
  interval?: number;
  maxDuration?: number;
  onProgress?: (data: any) => void;
  signal?: AbortSignal;
}

export async function pollStatus(
  statusUrl: string,
  isComplete: (data: any) => boolean,
  options: PollOptions = {}
): Promise<any> {
  const {
    interval = 2000,
    maxDuration = 300000, // 5分钟
    onProgress,
    signal,
  } = options;

  const startTime = Date.now();

  const checkStatus = async (): Promise<any> => {
    // 检查是否超时
    if (Date.now() - startTime > maxDuration) {
      console.error('[Poll] Polling timeout reached after', maxDuration, 'ms');
      const timeoutError = new Error('Polling timeout: Operation took too long');
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }

    // 检查是否被取消
    if (signal?.aborted) {
      throw new Error('Polling cancelled');
    }

    try {
      const response = await callApiWithRetry(statusUrl, {
        timeout: 10000, // 10秒超时
        retries: 1, // 状态检查减少重试次数
        signal,
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();
      onProgress?.(data);

      if (isComplete(data)) {
        return data;
      }

      // 继续轮询
      await new Promise((resolve) => setTimeout(resolve, interval));
      return checkStatus();
    } catch (error) {
      // 状态检查失败，可能需要重试
      console.error('[Poll] Status check error:', error);
      
      // 如果是用户取消或超时错误，直接抛出
      if ((error as any).isTimeout || (error as Error).name === 'AbortError') {
        throw error;
      }
      
      // 如果不是最终超时，继续尝试
      if (Date.now() - startTime < maxDuration) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        return checkStatus();
      }
      
      // 达到最大时间限制
      const timeoutError = new Error('Polling timeout: Maximum duration exceeded');
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }
  };

  return checkStatus();
}

/**
 * 错误类型判断
 */
export function getErrorType(error: Error): 'timeout' | 'server' | 'network' | 'cancelled' | 'unknown' {
  // Check for timeout errors (including our custom isTimeout flag)
  if ((error as any).isTimeout || 
      error.message.toLowerCase().includes('timeout') || 
      error.message.includes('taking longer than expected')) {
    return 'timeout';
  }
  if (error.message.includes('Server error') || error.message.includes('500')) {
    return 'server';
  }
  if (error.name === 'AbortError' || error.message.includes('cancelled')) {
    return 'cancelled';
  }
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return 'network';
  }
  return 'unknown';
}