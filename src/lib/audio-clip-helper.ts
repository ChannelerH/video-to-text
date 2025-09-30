import { createWavClipFromUrl } from '@/lib/audio-clip';
import { POLICY } from '@/services/policy';
import { CloudflareR2Service } from '@/lib/r2-upload';

/**
 * For FREE tier users: return the original audio URL without clipping
 *
 * NOTE: Audio clipping is disabled because:
 * 1. Vercel serverless doesn't support ffmpeg (50MB limit, binary not found)
 * 2. Cloudflare Workers can't run ffmpeg.wasm (missing browser APIs)
 * 3. Alternative solutions (AWS Lambda) add complexity
 *
 * Free users can now transcribe full audio files.
 * Consider adding duration limits at the transcription service level instead.
 *
 * @param sourceUrl - The original audio URL
 * @param jobId - Job ID for logging
 * @param filePrefix - Prefix for logging
 * @returns The original audio URL (no clipping)
 */
export async function clipAudioForFreeTier(
  sourceUrl: string,
  jobId: string,
  filePrefix: string = 'audio'
): Promise<string | null> {
  try {
    console.log(`[Audio Clip Helper] FREE tier - returning full audio (clipping disabled): ${filePrefix}_${jobId}`);
    console.log(`[Audio Clip Helper] Audio URL: ${sourceUrl}`);

    // Simply return the original URL - no clipping
    return sourceUrl;
  } catch (error: any) {
    console.error(`[Audio Clip Helper] Failed to process audio:`, error?.message || error);
    return null;
  }
}

/**
 * Upload full audio buffer to R2 (no clipping)
 * @param fullAudioBuffer - The full audio buffer to process
 * @param videoId - Video/Job ID for unique file naming
 * @param originalFormat - Original audio format (e.g., 'webm', 'mp3')
 * @returns The URL of the uploaded audio, or null if upload fails
 */
export async function clipAudioFromBuffer(
  fullAudioBuffer: Buffer,
  videoId: string,
  originalFormat: string = 'webm'
): Promise<string | null> {
  try {
    const r2 = new CloudflareR2Service();

    console.log(`[Audio Clip Helper] Uploading full audio (no clipping): ${videoId}.${originalFormat}`);

    // Upload the full audio file
    const upload = await r2.uploadFile(
      fullAudioBuffer,
      `free_${videoId}.${originalFormat}`,
      `audio/${originalFormat}`,
      {
        folder: 'free-audio',
        expiresIn: 24,
        makePublic: true
      }
    );

    const audioUrl = upload.publicUrl || upload.url;
    console.log(`[Audio Clip Helper] Successfully uploaded: ${audioUrl}`);

    return audioUrl;
  } catch (error: any) {
    console.error(`[Audio Clip Helper] Failed to upload audio:`, error?.message || error);
    return null;
  }
}