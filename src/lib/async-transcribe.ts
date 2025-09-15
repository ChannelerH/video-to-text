// Helper functions for async transcription with polling

export async function submitTranscriptionJob(requestData: any): Promise<{ success: boolean; job_id?: string; error?: string }> {
  try {
    const response = await fetch('/api/transcribe/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to submit job');
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
  onProgress?: (status: string, message: string) => void,
  maxAttempts: number = 180, // 15 minutes max (5s intervals)
  interval: number = 5000 // 5 seconds
): Promise<any> {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`/api/transcribe/status/${jobId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to process transcription');
      }

      // Update progress with status only (message handled by caller)
      if (onProgress) {
        onProgress(result.status, '');
      }

      // Check if completed
      if (result.status === 'completed') {
        return {
          success: true,
          data: {
            transcription: {
              segments: JSON.parse(result.results.json || '[]'),
              text: result.results.txt || '',
              language: result.language,
              duration: result.duration
            },
            title: result.title,
            formats: {
              srt: result.results.srt,
              vtt: result.results.vtt,
              txt: result.results.txt
            },
            // 将 jobId 回传给前端用于“Edit Transcription”跳转
            jobId
          }
        };
      }

      // Check if failed
      if (result.status === 'failed') {
        throw new Error('Transcription failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;

    } catch (error) {
      console.error('Poll error:', error);
      
      // If it's a network error, retry a few times
      if (attempts < 3) {
        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;
        continue;
      }
      
      throw error;
    }
  }

  throw new Error('Transcription timeout - job took too long');
}

export async function transcribeAsync(
  requestData: any,
  onProgress?: (stage: string, percentage: number, message: string) => void
): Promise<any> {
  // Step 1: Submit job - hide queue messaging
  if (onProgress) {
    onProgress('processing', 10, 'Starting transcription...');
  }
  
  const submitResult = await submitTranscriptionJob(requestData);
  
  if (!submitResult.success || !submitResult.job_id) {
    throw new Error(submitResult.error || 'Failed to start transcription');
  }

  // 可选的本地长任务兜底（默认关闭）。
  // 仅当构建时注入 NEXT_PUBLIC_PROCESS_ONE_FALLBACK==='true' 时才触发。
  try {
    if (process.env.NEXT_PUBLIC_PROCESS_ONE_FALLBACK === 'true') {
      fetch('/api/transcribe/process-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: submitResult.job_id })
      }).catch(() => {});
    }
  } catch {}

  // Step 2: Poll for result - use friendly messages
  if (onProgress) {
    onProgress('processing', 30, 'Processing your audio...');
  }

  const result = await pollJobStatus(
    submitResult.job_id,
    (status, message) => {
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
        onProgress(status, friendly.percentage, friendly.message);
      }
    }
  );

  return result;
}
