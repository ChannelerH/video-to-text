import { createWavClipFromUrl } from '@/lib/audio-clip';
import { POLICY } from '@/services/policy';
import { CloudflareR2Service } from '@/lib/r2-upload';
import { ffmpegEnabled } from '@/lib/ffmpeg-config';

function resolveClipSeconds(seconds?: number | null): number {
  const base = POLICY.preview.freePreviewSeconds || 300;
  const numeric = Number(seconds);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.ceil(numeric));
  }
  return Math.max(1, Math.ceil(base));
}

/**
 * Clip audio for preview/free usage and upload to R2. Falls back to original URL when FFmpeg is disabled.
 */
export interface ClippedAudioResult {
  url: string;
  key?: string;
}

export async function clipAudioForFreeTier(
  sourceUrl: string,
  jobId: string,
  filePrefix: string = 'audio',
  seconds?: number | null
): Promise<ClippedAudioResult | null> {
  try {
    const clipSeconds = resolveClipSeconds(seconds);

    if (!ffmpegEnabled) {
      console.log('[Audio Clip Helper] FFmpeg disabled; returning original audio for clipping request', {
        jobId,
        filePrefix,
        clipSeconds,
      });
      return { url: sourceUrl };
    }

    const clippedBuffer = await createWavClipFromUrl(sourceUrl, clipSeconds);

    const r2 = new CloudflareR2Service();
    const upload = await r2.uploadFile(
      clippedBuffer,
      `${filePrefix}_preview_${jobId}_${clipSeconds}s.wav`,
      'audio/wav',
      {
        folder: 'clipped-audio',
        expiresIn: 24,
        makePublic: true,
      }
    );

    const clippedUrl = upload.publicUrl || upload.url;
    console.log('[Audio Clip Helper] Successfully clipped audio', {
      jobId,
      filePrefix,
      clipSeconds,
      clippedUrl,
    });
    return { url: clippedUrl, key: upload.key };
  } catch (error: any) {
    console.error('[Audio Clip Helper] Failed to clip audio', {
      jobId,
      filePrefix,
      message: error?.message || error,
    });
    return null;
  }
}

/**
 * Clip audio when only the raw buffer is available (e.g., after downloading YouTube media).
 * Uploads a temporary asset first, then reuses clipAudioForFreeTier for the actual trimming.
 */
export async function clipAudioFromBuffer(
  fullAudioBuffer: Buffer,
  videoId: string,
  originalFormat: string = 'webm',
  seconds?: number | null
): Promise<string | null> {
  try {
    const r2 = new CloudflareR2Service();

    if (!ffmpegEnabled) {
      console.log('[Audio Clip Helper] FFmpeg disabled; uploading full audio without clipping', {
        videoId,
        originalFormat,
      });
      const upload = await r2.uploadFile(
        fullAudioBuffer,
        `free_${videoId}.${originalFormat}`,
        `audio/${originalFormat}`,
        {
          folder: 'free-audio',
          expiresIn: 24,
          makePublic: true,
        }
      );
      return upload.publicUrl || upload.url;
    }

    const tempUpload = await r2.uploadFile(
      fullAudioBuffer,
      `temp_${videoId}.${originalFormat}`,
      `audio/${originalFormat}`,
      {
        folder: 'temp-audio',
        expiresIn: 1,
        makePublic: true,
      }
    );

    const result = await clipAudioForFreeTier(tempUpload.publicUrl || tempUpload.url, videoId, 'youtube', seconds);
    return result?.url ?? null;
  } catch (error: any) {
    console.error('[Audio Clip Helper] Failed to process audio buffer', {
      videoId,
      message: error?.message || error,
    });
    return null;
  }
}
