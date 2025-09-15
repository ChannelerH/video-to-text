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
        throw new Error(result.error || 'Failed to get job status');
      }

      // Update progress
      if (onProgress) {
        onProgress(result.status, result.message || 'Processing...');
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
            }
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
  // Step 1: Submit job
  if (onProgress) {
    onProgress('submit', 10, 'Submitting transcription job...');
  }
  
  const submitResult = await submitTranscriptionJob(requestData);
  
  if (!submitResult.success || !submitResult.job_id) {
    throw new Error(submitResult.error || 'Failed to submit job');
  }

  // Step 2: Poll for result
  if (onProgress) {
    onProgress('processing', 30, 'Processing transcription...');
  }

  const result = await pollJobStatus(
    submitResult.job_id,
    (status, message) => {
      // Map status to progress percentage
      const progressMap: Record<string, number> = {
        'queued': 20,
        'downloading': 40,
        'transcribing': 60,
        'refining': 80,
        'completed': 100
      };
      
      const percentage = progressMap[status] || 50;
      if (onProgress) {
        onProgress(status, percentage, message);
      }
    }
  );

  return result;
}