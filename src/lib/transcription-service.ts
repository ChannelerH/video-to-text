/**
 * Shared transcription service for handling file uploads and transcription jobs
 * Used by both homepage ToolInterface and Quick Actions
 */

import { MultipartUploader } from '@/lib/multipart-upload';

export interface TranscriptionOptions {
  highAccuracy?: boolean;
  enableDiarization?: boolean;
  selectedTrack?: number;
  language?: string;
}

export interface TranscriptionResult {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  data?: any;
  error?: string;
}

export class TranscriptionService {
  /**
   * Upload file to R2 storage
   */
  static async uploadFile(
    file: File,
    mode: 'audio' | 'video' = 'video',
    onProgress?: (progress: number) => void,
    requestOptions?: { signal?: AbortSignal }
  ): Promise<{ key: string; url: string }> {
    const modeHint = file.type.startsWith('audio/') ? 'audio' : mode;
    let r2Key = '';
    let fileUrl = '';
    const signal = requestOptions?.signal;

    if (MultipartUploader.shouldUseMultipart(file.size)) {
      // Multipart upload for large files
      const uploader = new MultipartUploader();
      const result = await uploader.upload({
        file: file,
        abortSignal: signal,
        onProgress: (progressPercentage, uploadedBytes, totalBytes) => {
          // Ensure we have a valid percentage value
          const percentage = typeof progressPercentage === 'number' 
            ? Math.round(progressPercentage) 
            : 0;
          onProgress?.(percentage);
        }
      });
      r2Key = result?.key || result?.r2Key || '';
      // Use replicateUrl for transcription (it's the presigned URL for Deepgram)
      fileUrl = result?.replicateUrl || result?.downloadUrl || result?.publicUrl || result?.url || '';
      
      if (!r2Key || !fileUrl) {
        console.error('[TranscriptionService] Invalid multipart upload result:', {
          r2Key,
          fileUrl,
          fullResult: result
        });
      }
    } else {
      // Presigned URL upload
      const presignResp = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          mode: modeHint
        }),
        signal
      });

      const presign = await presignResp.json();
      if (!presignResp.ok || !presign?.success) {
        throw new Error(presign?.error || 'Failed to get upload URL');
      }
      
      const { uploadUrl, key, publicUrl, downloadUrl } = presign.data;
      r2Key = key;
      
      try {
        // Try direct upload to R2
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          if (file.type) xhr.setRequestHeader('Content-Type', file.type);
          
          let abortHandler: (() => void) | null = null;
          if (signal) {
            abortHandler = () => {
              try {
                xhr.abort();
              } catch {}
            };
            signal.addEventListener('abort', abortHandler);
          }

          const cleanup = () => {
            if (abortHandler && signal) {
              signal.removeEventListener('abort', abortHandler);
            }
          };

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100);
              onProgress?.(progress);
            }
          });
          
          xhr.onload = () => {
            cleanup();
            if (xhr.status === 200 || xhr.status === 204) {
              resolve();
            } else {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          };
          
          xhr.onerror = () => {
            cleanup();
            reject(new Error('Upload error'));
          };
          xhr.onabort = () => {
            cleanup();
            reject(new Error('Upload aborted'));
          };
          xhr.send(file);
        });
        
        fileUrl = downloadUrl || publicUrl;
      } catch (e) {
        // CORS fallback
        const form = new FormData();
        form.append('file', file);
        form.append('mode', modeHint);
        
        const uploadResp = await fetch('/api/upload', {
          method: 'POST',
          body: form,
          signal
        });

        const uploadResult = await uploadResp.json();
        if (!uploadResp.ok || !uploadResult?.success) {
          throw new Error(uploadResult?.error || 'Upload failed');
        }
        
        r2Key = uploadResult.data?.r2Key || uploadResult.data?.key || r2Key;
        fileUrl = uploadResult.data?.publicUrl || uploadResult.data?.replicateUrl || '';
      }
    }

    return { key: r2Key, url: fileUrl };
  }

  /**
   * Start transcription job for uploaded file
   */
  static async startFileTranscription(
    fileUrl: string,
    r2Key: string,
    originalFileName: string,
    options: TranscriptionOptions = {},
    requestOptions?: { signal?: AbortSignal }
  ): Promise<string> {
    // Map enableDiarization to enableDiarizationAfterWhisper for API compatibility
    const apiOptions = {
      r2Key,
      originalFileName,
      highAccuracy: options.highAccuracy,
      enableDiarizationAfterWhisper: options.enableDiarization,
      selectedTrack: options.selectedTrack,
      language: options.language
    };
    
    const requestBody = {
      type: 'file_upload',
      content: fileUrl,
      action: 'transcribe',
      options: apiOptions
    };
    
    const response = await fetch('/api/transcribe/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: requestOptions?.signal
    });

    const data = await response.json();

    if (!response.ok || !data?.success || !data?.job_id) {
      console.error('[TranscriptionService] Transcription failed:', {
        status: response.status,
        error: data?.error,
        details: data
      });
      throw new Error(data?.error || 'Failed to start transcription job');
    }

    return data.job_id;
  }

  /**
   * Start transcription job for YouTube URL
   */
  static async startYouTubeTranscription(
    url: string,
    options: TranscriptionOptions = {},
    requestOptions?: { signal?: AbortSignal }
  ): Promise<string> {
    // Map enableDiarization to enableDiarizationAfterWhisper for API compatibility
    const apiOptions = {
      highAccuracy: options.highAccuracy,
      enableDiarizationAfterWhisper: options.enableDiarization,
      selectedTrack: options.selectedTrack,
      language: options.language
    };
    
    const response = await fetch('/api/transcribe/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'youtube_url',
        content: url,
        action: 'transcribe',
        options: apiOptions
      }),
      signal: requestOptions?.signal
    });

    const data = await response.json();
    if (!response.ok || !data?.success || !data?.job_id) {
      throw new Error(data?.error || 'Failed to start transcription job');
    }

    return data.job_id;
  }

  /**
   * Cancel an in-flight transcription job
   */
  static async cancelJob(jobId: string): Promise<{ success: boolean; status?: string; error?: string }> {
    const response = await fetch(`/api/transcriptions/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const errorMessage = data?.error || 'Failed to cancel transcription job';
      throw new Error(errorMessage);
    }

    return data || { success: true, status: 'cancelled' };
  }

  /**
   * Poll transcription job status
   */
  static async pollJobStatus(
    jobId: string,
    onProgress?: (status: string, progress: number) => void,
    maxAttempts: number = 60,
    interval: number = 2000
  ): Promise<TranscriptionResult> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`/api/transcribe/status?job_id=${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to check job status');
      }

      const status = data.status;
      const progress = data.progress || 0;
      onProgress?.(status, progress);

      if (status === 'completed') {
        return {
          jobId,
          status: 'completed',
          data: data.result
        };
      }

      if (status === 'failed' || status === 'cancelled') {
        return {
          jobId,
          status,
          error: data.error || (status === 'cancelled' ? 'Transcription cancelled' : 'Transcription failed')
        };
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Transcription timeout');
  }
}
