import { createWavClipFromUrl } from '@/lib/audio-clip';
import { POLICY } from '@/services/policy';
import { CloudflareR2Service } from '@/lib/r2-upload';

/**
 * Clips audio for FREE tier users and uploads to R2
 * @param sourceUrl - The original audio URL to clip
 * @param jobId - Job ID for unique file naming
 * @param filePrefix - Prefix for the clipped file (e.g., 'youtube', 'file', 'rerun')
 * @returns The URL of the clipped audio, or null if clipping fails
 */
export async function clipAudioForFreeTier(
  sourceUrl: string,
  jobId: string,
  filePrefix: string = 'audio'
): Promise<string | null> {
  try {
    console.log(`[Audio Clip Helper] Clipping audio for FREE tier: ${filePrefix}_${jobId}`);
    
    const maxSeconds = POLICY.preview.freePreviewSeconds || 300;
    
    // Clip the audio to the specified duration
    const clippedBuffer = await createWavClipFromUrl(sourceUrl, maxSeconds);
    
    // Upload clipped audio to R2
    const r2 = new CloudflareR2Service();
    const upload = await r2.uploadFile(
      clippedBuffer,
      `${filePrefix}_free_${jobId}_${maxSeconds}s.wav`,
      'audio/wav',
      { 
        folder: 'clipped-audio', 
        expiresIn: 24, 
        makePublic: true 
      }
    );
    
    const clippedUrl = upload.publicUrl || upload.url;
    console.log(`[Audio Clip Helper] Successfully clipped and uploaded: ${clippedUrl}`);
    
    return clippedUrl;
  } catch (error: any) {
    console.error(`[Audio Clip Helper] Failed to clip audio:`, error?.message || error);
    return null;
  }
}

/**
 * Clips audio for FREE tier with temporary upload support
 * Used when we need to upload the full file first before clipping
 * @param fullAudioBuffer - The full audio buffer to process
 * @param videoId - Video/Job ID for unique file naming
 * @param originalFormat - Original audio format (e.g., 'webm', 'mp3')
 * @returns The URL of the clipped audio, or null if clipping fails
 */
export async function clipAudioFromBuffer(
  fullAudioBuffer: Buffer,
  videoId: string,
  originalFormat: string = 'webm'
): Promise<string | null> {
  try {
    const r2 = new CloudflareR2Service();
    
    // First upload the full audio temporarily
    const tempUpload = await r2.uploadFile(
      fullAudioBuffer, 
      `temp_${videoId}.${originalFormat}`,
      `audio/${originalFormat}`,
      { 
        folder: 'temp-audio', 
        expiresIn: 1, // 1 hour for temp file
        makePublic: true 
      }
    );
    
    // Clip using the temporary URL
    const clippedUrl = await clipAudioForFreeTier(
      tempUpload.url,
      videoId,
      'youtube'
    );
    
    return clippedUrl;
  } catch (error: any) {
    console.error(`[Audio Clip Helper] Failed to clip from buffer:`, error?.message || error);
    return null;
  }
}