// Helper functions for async transcription with polling
import { callApiWithRetry, pollStatus } from '@/lib/api-utils';

export async function submitTranscriptionJob(requestData: any): Promise<{ success: boolean; job_id?: string; error?: string; code?: string }> {
  try {
    const response = await callApiWithRetry('/api/transcribe/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
      timeout: 30000, // 30 seconds
      retries: 3
    });

    const result = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'Failed to submit job',
        code: result.code
      };
    }

    return result;
  } catch (error) {
    console.error('Submit job error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit job'
    };
  }
}

export async function pollJobStatus(
  jobId: string,
  onProgress?: (status: string, message: string, warning?: string) => void,
  maxAttempts: number = 180, // 15 minutes max (5s intervals)
  interval: number = 5000, // 5 seconds
  signal?: AbortSignal
): Promise<any> {
  const maxDuration = maxAttempts * interval; // Maximum duration in milliseconds
  
  try {
    const result = await pollStatus(
      `/api/transcribe/status/${jobId}`,
      (data) => {
        // Check if the job is complete
        if (data.status === 'completed' || data.status === 'failed') {
          return true;
        }
        
        // Update progress with warning if present
        if (onProgress) {
          onProgress(data.status, '', data.warning);
        }
        
        return false;
      },
      {
        interval,
        maxDuration,
        signal,
        onProgress: (data) => {
          if (onProgress && data.status) {
            onProgress(data.status, '', data.warning);
          }
        }
      }
    );

    // Check the final status
    if (result.status === 'completed') {
      const tier = (result as any).tier || 'free';

      const baseFormats: Record<string, string | undefined> = {
        srt: result.results.srt,
        vtt: result.results.vtt,
        txt: result.results.txt,
      };

      // Only include json and md for non-free users
      if (tier !== 'free') {
        if (result.results.json) {
          baseFormats.json = result.results.json;
        }
        if (result.results.md) {
          baseFormats.md = result.results.md;
        }
      }

      let parsedJson: any = null;
      if (result.results.json) {
        try {
          parsedJson = JSON.parse(result.results.json);
        } catch (error) {
          console.warn('[pollJobStatus] Failed to parse JSON format:', error);
        }
      }

      const segments = Array.isArray(parsedJson?.segments)
        ? parsedJson.segments
        : Array.isArray(parsedJson)
          ? parsedJson
          : [];

      const textFromJson = typeof parsedJson?.text === 'string' ? parsedJson.text : '';
      const languageFromJson = typeof parsedJson?.language === 'string' ? parsedJson.language : undefined;
      const durationFromJson = typeof parsedJson?.duration === 'number' ? parsedJson.duration : undefined;
      const titleFromJson = typeof parsedJson?.title === 'string' ? parsedJson.title : undefined;
      const sourceTypeFromJson = parsedJson?.source_type;
      const sourceUrlFromJson = parsedJson?.source_url;

      return {
        success: true,
        data: {
          transcription: {
            segments,
            text: textFromJson || result.results.txt || '',
            language: languageFromJson || result.language,
            duration: durationFromJson ?? result.duration,
            title: titleFromJson || result.title,
            source_type: sourceTypeFromJson || result.source_type,
            source_url: sourceUrlFromJson || result.source_url,
          },
          title: titleFromJson || result.title,
          formats: baseFormats,
          tier,
          sourceType: result.source_type,
          sourceUrl: result.source_url,
          processedUrl: result.processed_url,
          originalDurationSec: result.original_duration_sec,
          // 将 jobId 回传给前端用于"Edit Transcription"跳转
          jobId
        }
      };
    } else if (result.status === 'failed') {
      const errorCode = result.error_code || result.error;
      const error = new Error(errorCode || 'Transcription failed');
      if (errorCode) {
        (error as any).errorCode = errorCode;
      }
      throw error;
    }

    throw new Error('Unexpected status: ' + result.status);
  } catch (error) {
    console.error('[pollJobStatus] Error:', error);
    
    // Handle timeout errors with better messaging
    if (error instanceof Error && (error.message.includes('timeout') || (error as any).isTimeout)) {
      const waitedMinutes = Math.round((maxAttempts * interval) / 60000);
      const timeoutError = new Error(`Transcription is taking longer than expected (${waitedMinutes}+ minutes). The service might be experiencing delays. Please try again later or contact support if the issue persists.`);
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }
    
    // Handle other errors
    if (error instanceof Error && error.message.includes('cancelled')) {
      throw new Error('Transcription was cancelled.');
    }
    
    throw error;
  }
}

export async function transcribeAsync(
  requestData: any,
  onProgress?: (stage: string, percentage: number, message: string, warning?: string) => void,
  signal?: AbortSignal
): Promise<any> {
  // Step 1: Submit job - hide queue messaging
  if (onProgress) {
    onProgress('processing', 10, 'Starting transcription...');
  }
  
  const submitResult = await submitTranscriptionJob(requestData);
  
  if (!submitResult.success || !submitResult.job_id) {
    const error = new Error(submitResult.error || 'Failed to start transcription');
    if (submitResult.code) {
      (error as any).errorCode = submitResult.code;
    }
    throw error;
  }

  // Store jobId for potential retry
  const jobId = submitResult.job_id;

  // 可选的本地长任务兜底（默认关闭）。
  // 仅当构建时注入 NEXT_PUBLIC_PROCESS_ONE_FALLBACK==='true' 时才触发。
  try {
    if (process.env.NEXT_PUBLIC_PROCESS_ONE_FALLBACK === 'true') {
      fetch('/api/transcribe/process-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId })
      }).catch(() => {});
    }
  } catch {}

  // Step 2: Poll for result - use friendly messages
  if (onProgress) {
    onProgress('processing', 30, 'Processing your audio...');
  }

  const result = await pollJobStatus(
    jobId,
    (status, message, warning) => {
      // Map status to user-friendly messages without queue references
      const friendlyMessages: Record<string, { percentage: number; message: string }> = {
        'queued': { percentage: 20, message: 'Preparing transcription...' },
        'downloading': { percentage: 40, message: 'Loading media file...' },
        'transcribing': { percentage: 60, message: 'Transcribing audio...' },
        'refining': { percentage: 80, message: 'Enhancing transcript quality...' },
        'processing': { percentage: 50, message: 'Processing your request...' },
        'completed': { percentage: 100, message: 'Transcription complete!' }
      };
      
      const friendly = friendlyMessages[status] || { percentage: 50, message: 'Processing...' };
      if (onProgress) {
        onProgress(status, friendly.percentage, friendly.message, warning);
      }
    },
    180, // maxAttempts
    5000, // interval
    signal // Pass the abort signal
  );

  return result;
}
