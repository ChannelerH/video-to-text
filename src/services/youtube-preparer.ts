import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { POLICY } from '@/services/policy';
import { YouTubeService } from '@/lib/youtube';

export class YoutubePrepareError extends Error {
  constructor(public code: string, message: string, public meta?: Record<string, any>) {
    super(message);
    this.name = 'YoutubePrepareError';
  }
}

interface PrefetchedVideoPayload {
  link?: string;
  title?: string;
  duration?: number;
  filesize?: number;
  isUploadedAsset?: boolean;
}

interface ReusableAudioRecord {
  processedUrl: string;
  title: string | null;
  originalDurationSec: number | null;
}

export interface PrepareYoutubeAudioParams {
  jobId: string;
  video: string;
  userTier?: string;
  preferredLanguage?: string;
  forceHighAccuracy?: boolean;
  videoPrefetch?: any;
  clipSecondsOverride?: number | null;
  isPreview?: boolean;
  userUuid?: string | null;
  jobOriginalDuration?: number | null;
  effectiveClipSeconds?: number | null;
}

export interface PrepareYoutubeAudioResult {
  videoId: string;
  processedUrl: string;
  audioUrl: string;
  supplierAudioUrl: string | null;
  videoTitle: string | null;
  videoDurationSeconds: number | null;
  fromReusable: boolean;
  usedPrefetch: boolean;
  clipSecondsApplied: number | null;
}

export async function prepareYoutubeAudioForJob(params: PrepareYoutubeAudioParams): Promise<PrepareYoutubeAudioResult> {
  const {
    jobId,
    video,
    userTier,
    preferredLanguage,
    forceHighAccuracy = false,
    videoPrefetch,
    clipSecondsOverride = null,
    isPreview = false,
    userUuid = null,
    jobOriginalDuration = null,
    effectiveClipSeconds: providedClipSeconds = null,
  } = params;

  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!video) {
    throw new Error('YouTube URL is required');
  }

  const jobUserUuid = (userUuid || '').trim() || null;
  const effectiveClipSeconds =
    providedClipSeconds !== null
      ? providedClipSeconds
      : await determineClipSecondsForYoutube({
          userTier,
          userUuid: jobUserUuid,
          clipSecondsOverride,
          isPreview,
        });

  const vid = YouTubeService.validateAndParseUrl(video) || String(video);
  if (!vid) {
    throw new Error('Invalid YouTube URL');
  }

  const prefetched = parseVideoPrefetch(videoPrefetch);
  const variantSuffix = forceHighAccuracy ? ':ha1' : ':ha0';
  const reusable = await findReusableAudioForVideo(vid, variantSuffix)
    || (variantSuffix !== ':ha0' ? await findReusableAudioForVideo(vid, ':ha0') : null);

  let audioUrl: string = '';
  let supplierAudioUrl: string | null = reusable?.processedUrl ?? null;
  let videoTitle: string | null = reusable?.title ?? null;
  let videoDurationSeconds: number | null = reusable?.originalDurationSec ?? null;

  if (reusable) {
    audioUrl = reusable.processedUrl;
  }

  if (prefetched) {
    if (!audioUrl && prefetched.link) {
      audioUrl = prefetched.link;
    }
    if (!videoTitle && prefetched.title) {
      videoTitle = prefetched.title;
    }
    if (!videoDurationSeconds && typeof prefetched.duration === 'number') {
      videoDurationSeconds = prefetched.duration;
    }
    if (!supplierAudioUrl && prefetched.link && prefetched.isUploadedAsset) {
      supplierAudioUrl = prefetched.link;
    }
  }

  if (!audioUrl) {
    try {
      audioUrl = await YouTubeService.getAudioStreamUrl(vid, preferredLanguage);
    } catch (error) {
      console.error('[YouTube Prepare] Failed to fetch audio via proxy', {
        videoId: vid,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new YoutubePrepareError('youtube_manual_upload_required', 'youtube_manual_upload_required');
    }
  }

  if (!videoTitle || !videoDurationSeconds) {
    const cachedAsset = YouTubeService.getCachedAudioAsset(vid);
    if (cachedAsset) {
      if (!videoTitle && cachedAsset.title) {
        videoTitle = cachedAsset.title;
      }
      if (!videoDurationSeconds && typeof cachedAsset.durationSeconds === 'number') {
        videoDurationSeconds = cachedAsset.durationSeconds;
      }
    }
  }

  if (!videoTitle || !videoDurationSeconds) {
    try {
      const info = await YouTubeService.getVideoInfo(vid);
      videoTitle = videoTitle || info.title || null;
      videoDurationSeconds = videoDurationSeconds || info.duration || null;
    } catch (error) {
      console.error('[YouTube Prepare] Failed to get video info:', error);
    }
  }

  // if (videoDurationSeconds && videoDurationSeconds > 0) {
  //   const { getUploadLimitForTier, formatSeconds } = await import('@/lib/duration-limits');
  //   const uploadLimit = getUploadLimitForTier(userTier as any, undefined);
  //   const skipDurationLimit = effectiveClipSeconds && shouldClipMedia(videoDurationSeconds, effectiveClipSeconds);

  //   if (!skipDurationLimit && uploadLimit > 0 && videoDurationSeconds > uploadLimit) {
  //     const actualDuration = Math.floor(videoDurationSeconds);
  //     throw new YoutubePrepareError(
  //       'duration_limit_exceeded',
  //       `Video duration ${formatSeconds(actualDuration)} exceeds limit of ${formatSeconds(uploadLimit)}`,
  //       {
  //         actualDuration,
  //         maxDuration: uploadLimit,
  //       }
  //     );
  //   }
  // }

  const resolveAudioUrl = async () => {
    if (audioUrl && isProxyHostedAudio(audioUrl)) {
      return audioUrl;
    }
    audioUrl = await YouTubeService.getAudioStreamUrl(vid, preferredLanguage);
    return audioUrl;
  };

  const isFreeTier = String(userTier || '').toLowerCase() === 'free';
  let finalUrl = await resolveAudioUrl();
  const normalizedUrl = normalizeDownloadUrl(finalUrl);
  if (normalizedUrl !== finalUrl) {
    console.log('[YouTube Prepare] Normalized download URL', {
      videoId: vid,
      original: finalUrl.substring(0, 120),
      normalized: normalizedUrl.substring(0, 120),
    });
    finalUrl = normalizedUrl;
  }
  console.log('[YouTube Prepare] Resolved audio URL via proxy', {
    videoId: vid,
    finalUrl,
    fromCache: !!reusable,
    throughPrefetch: !!prefetched,
  });

  supplierAudioUrl = finalUrl;

  const needsClipPreview = isFreeTier
    && effectiveClipSeconds
    && shouldClipMedia(videoDurationSeconds ?? jobOriginalDuration, effectiveClipSeconds);

  if (needsClipPreview) {
    const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
    const clipped = await clipAudioForFreeTier(finalUrl, jobId, 'youtube', effectiveClipSeconds);
    if (clipped?.url) {
      supplierAudioUrl = clipped.url;
    } else {
      console.warn('[YouTube Prepare] Clip helper failed, falling back to proxy audio');
    }
  }

  const processedUrl = supplierAudioUrl || audioUrl;
  const updateData: Record<string, any> = { processed_url: processedUrl };

  if (videoTitle) {
    updateData.title = videoTitle;
  }

  if (videoDurationSeconds && videoDurationSeconds > 0) {
    updateData.original_duration_sec = videoDurationSeconds;
    console.log('[YouTube Prepare] Storing original duration:', videoDurationSeconds, 'seconds');
  }

  await db().update(transcriptions)
    .set(updateData)
    .where(and(eq(transcriptions.job_id, jobId), ne(transcriptions.status, 'cancelled')));

  return {
    videoId: vid,
    processedUrl,
    audioUrl,
    supplierAudioUrl,
    videoTitle,
    videoDurationSeconds,
    fromReusable: !!reusable,
    usedPrefetch: !!prefetched,
    clipSecondsApplied: effectiveClipSeconds,
  };
}

export function parseVideoPrefetch(raw: any): PrefetchedVideoPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload: PrefetchedVideoPayload = {};
  if (typeof raw.link === 'string' && raw.link.length > 0) {
    payload.link = raw.link;
    if (!payload.isUploadedAsset) {
      payload.isUploadedAsset = raw.isUploadedAsset === true || /\.r2\.dev\//.test(raw.link);
    }
  }
  if (typeof raw.title === 'string') {
    payload.title = raw.title;
  }
  const duration = Number(raw.duration ?? raw.duration_seconds ?? raw.original_duration_sec);
  if (Number.isFinite(duration) && duration > 0) {
    payload.duration = Math.round(duration);
  }
  const filesize = Number(raw.filesize);
  if (Number.isFinite(filesize) && filesize > 0) {
    payload.filesize = Math.round(filesize);
  }
  return payload;
}

export async function determineClipSecondsForYoutube(params: {
  userTier?: string;
  userUuid: string | null;
  clipSecondsOverride: number | null;
  isPreview: boolean;
}): Promise<number | null> {
  const { userTier, userUuid, clipSecondsOverride, isPreview } = params;

  if (clipSecondsOverride && clipSecondsOverride > 0) {
    return Math.max(1, Math.ceil(clipSecondsOverride));
  }

  const normalizedTier = String(userTier || '').toLowerCase();
  const isAnonymous = !userUuid;
  const isFreeTier = normalizedTier === 'free';

  if (!isPreview && !isAnonymous && !isFreeTier) {
    return null;
  }

  const previewBase = POLICY.preview.freePreviewSeconds || 300;
  return Math.max(1, Math.ceil(previewBase));
}

export function shouldClipMedia(originalDurationSeconds: number | null, limitSeconds: number): boolean {
  if (!limitSeconds || limitSeconds <= 0) return false;
  if (!originalDurationSeconds || !Number.isFinite(originalDurationSeconds)) {
    return true;
  }
  const tolerance = 1;
  return originalDurationSeconds - limitSeconds > tolerance;
}

async function findReusableAudioForVideo(videoId: string, variantSuffix: string): Promise<ReusableAudioRecord | null> {
  try {
    const [existing] = await db()
      .select({
        processedUrl: transcriptions.processed_url,
        title: transcriptions.title,
        originalDurationSec: transcriptions.original_duration_sec,
      })
      .from(transcriptions)
      .where(and(
        eq(transcriptions.source_hash, `${videoId}${variantSuffix}`),
        eq(transcriptions.status, 'completed'),
        isNotNull(transcriptions.processed_url)
      ))
      .orderBy(desc(transcriptions.created_at), desc(transcriptions.id))
      .limit(1);

    if (existing && existing.processedUrl) {
      return existing as ReusableAudioRecord;
    }
  } catch (error) {
    console.warn('[YouTube Prepare] Failed to look up reusable audio:', error);
  }
  return null;
}

function isProxyHostedAudio(url: string | null | undefined): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return normalized.includes('.r2.dev/')
    || normalized.includes('pub-')
    || normalized.includes('/api/media/proxy');
}

function normalizeDownloadUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    const normalizedPath = urlObj.pathname
      .split('/')
      .map(segment => encodeURIComponent(decodeURIComponent(segment)))
      .join('/');
    urlObj.pathname = normalizedPath;

    const originalParams = urlObj.searchParams;
    const normalizedParams = new URLSearchParams();
    originalParams.forEach((value, key) => {
      try {
        const decodedValue = decodeURIComponent(value);
        normalizedParams.append(key, decodedValue);
      } catch {
        normalizedParams.append(key, value);
      }
    });
    urlObj.search = normalizedParams.toString();

    return urlObj.toString();
  } catch {
    return url;
  }
}
