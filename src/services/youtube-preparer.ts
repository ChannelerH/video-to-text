import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { CloudflareR2Service } from '@/lib/r2-upload';
import { POLICY } from '@/services/policy';
import { YouTubeService } from '@/lib/youtube';
import { Readable } from 'stream';

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

interface UploadAudioUrlToR2Params {
  sourceUrl: string;
  videoId: string;
  r2?: CloudflareR2Service;
  contextLabel?: string;
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
      try {
        const fmts = await YouTubeService.getOptimizedAudioFormats(vid, preferredLanguage);
        const pick = fmts.find(f => !!f.url) || fmts[0];
        if (pick?.url) {
          audioUrl = pick.url;
        }
      } catch {}

      if (!audioUrl) {
        throw new YoutubePrepareError('youtube_manual_upload_required', 'youtube_manual_upload_required');
      }
    }
  }

  const r2 = new CloudflareR2Service();
  const cfg = r2.validateConfig();
  if (!cfg.isValid) {
    console.warn('[YouTube Prepare] R2 not configured properly:', cfg);
  } else {
    if (!videoTitle || !videoDurationSeconds) {
      try {
        const info = await YouTubeService.getVideoInfo(vid);
        videoTitle = videoTitle || info.title || null;
        videoDurationSeconds = videoDurationSeconds || info.duration || null;
      } catch (error) {
        console.error('[YouTube Prepare] Failed to get video info:', error);
      }
    }

    if (videoDurationSeconds && videoDurationSeconds > 0) {
      const { getUploadLimitForTier, formatSeconds } = await import('@/lib/duration-limits');
      const uploadLimit = getUploadLimitForTier(userTier as any, undefined);
      const skipDurationLimit = effectiveClipSeconds && shouldClipMedia(videoDurationSeconds, effectiveClipSeconds);

      if (!skipDurationLimit && uploadLimit > 0 && videoDurationSeconds > uploadLimit) {
        const actualDuration = Math.floor(videoDurationSeconds);
        throw new YoutubePrepareError(
          'duration_limit_exceeded',
          `Video duration ${formatSeconds(actualDuration)} exceeds limit of ${formatSeconds(uploadLimit)}`,
          {
            actualDuration,
            maxDuration: uploadLimit,
          }
        );
      }
    }

    const resolveAudioUrl = async () => {
      if (audioUrl) return audioUrl;
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
    console.log('[YouTube Prepare] Resolved audio URL from RapidAPI', {
      videoId: vid,
      finalUrl,
      fromCache: !!reusable,
      throughPrefetch: !!prefetched,
    });

    const verified = await ensureDownloadReady({
      videoId: vid,
      preferredLanguage,
      initialUrl: finalUrl,
      contextLabel: '[YouTube Prepare] Verify',
    });

    if (verified?.url) {
      if (verified.url !== finalUrl) {
        console.log('[YouTube Prepare] Download URL refreshed after verification', {
          videoId: vid,
        });
      }
      finalUrl = verified.url;
    }

    const needsClipPreview = isFreeTier
      && effectiveClipSeconds
      && shouldClipMedia(videoDurationSeconds ?? jobOriginalDuration, effectiveClipSeconds);

    if (needsClipPreview) {
      const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
      const clipped = await clipAudioForFreeTier(finalUrl, jobId, 'youtube', effectiveClipSeconds);
      if (clipped?.url) {
        supplierAudioUrl = clipped.url;
      } else {
        console.warn('[YouTube Prepare] Clip helper failed, falling back to full audio upload');
      }
    }

    if (!supplierAudioUrl) {
      try {
        const uploadedUrl = await uploadAudioUrlToR2({
          sourceUrl: finalUrl,
          videoId: vid,
          r2,
          contextLabel: '[YouTube Prepare] Upload',
        });
        supplierAudioUrl = uploadedUrl || finalUrl;
        if (uploadedUrl) {
          console.log('[YouTube Prepare] Audio uploaded to R2', { videoId: vid, uploadedUrl });
        } else {
          console.warn('[YouTube Prepare] R2 upload skipped or failed, falling back to original URL', {
            videoId: vid,
            finalUrl,
          });
        }
      } catch (uploadError) {
        console.error('[YouTube Prepare] Failed to upload audio to R2:', uploadError);
        supplierAudioUrl = supplierAudioUrl || finalUrl;
      }
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

async function uploadAudioUrlToR2({
  sourceUrl,
  videoId,
  r2,
  contextLabel = '[YouTube Prepare] Upload',
}: UploadAudioUrlToR2Params): Promise<string | null> {
  const bucket = process.env.STORAGE_BUCKET || '';
  if (!bucket) {
    console.warn(`${contextLabel} Missing STORAGE_BUCKET configuration`);
    return null;
  }

  const publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
  const key = `youtube-audio/${videoId}_${Date.now()}.webm`;
  const publicUrlBase = publicDomain
    ? (publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`)
    : `https://pub-${bucket}.r2.dev`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const requiresRangeHeader = hasRangeQueryParam(sourceUrl);
  if (requiresRangeHeader) {
    headers['Range'] = 'bytes=0-';
  }

  const maxAttempts = Math.max(1, Number(process.env.RAPIDAPI_DOWNLOAD_MAX_ATTEMPTS || 4));
  const baseDelayMs = Math.max(200, Number(process.env.RAPIDAPI_DOWNLOAD_RETRY_DELAY || 750));
  const initialDelayMs = Math.max(0, Number(process.env.RAPIDAPI_DOWNLOAD_INITIAL_DELAY || 0));

  let lastError: unknown;

  if (initialDelayMs > 0) {
    console.log(`${contextLabel} Initial delay before download`, {
      videoId,
      delayMs: initialDelayMs,
      sourceUrl,
    });
    await sleep(initialDelayMs);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const attemptLabel = `${contextLabel} Attempt ${attempt}`;
      console.log(`${attemptLabel} stream upload`, {
        videoId,
        key,
        publicUrlBase,
        sourceUrl,
      });

      const response = await fetch(sourceUrl, { headers });
      console.log(`${attemptLabel} source response`, {
        videoId,
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const error: any = new Error(`Failed to fetch audio stream (${response.status})`);
        error.status = response.status;
        throw error;
      }

      const contentType = response.headers.get('content-type') || 'audio/webm';
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

      if (!response.body || !contentLength || !Number.isFinite(contentLength) || contentLength <= 0) {
        console.log(`${attemptLabel} switching to buffered upload`, {
          videoId,
          hasBody: !!response.body,
          contentLength,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        const service = r2 ?? new CloudflareR2Service();
        const upload = await service.uploadFile(buffer, `${videoId}.webm`, contentType, {
          folder: 'youtube-audio',
          expiresIn: 24,
          makePublic: true,
        });
        console.log(`${attemptLabel} buffered upload succeeded`, {
          videoId,
          key: upload.key,
          publicUrl: upload.publicUrl,
        });
        return upload.publicUrl || upload.url;
      }

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: process.env.STORAGE_REGION || 'auto',
        endpoint: process.env.STORAGE_ENDPOINT,
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
          secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
        },
      });

      const nodeStream = Readable.fromWeb(response.body as any);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: nodeStream,
        ContentType: contentType,
        ContentLength: contentLength,
        Metadata: {
          'upload-time': new Date().toISOString(),
          source: 'youtube-prepare',
        },
        ACL: 'public-read',
      }));

      const publicUrl = `${publicUrlBase}/${key}`;
      console.log(`${attemptLabel} stream upload succeeded`, {
        videoId,
        key,
        publicUrl,
        contentLength,
      });

      return publicUrl;
    } catch (error) {
      lastError = error;
      const status = (error as any)?.status;
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = status === 404 || status === 403 || status === 500 || status === 502 || status === 503 || status === 504;
      if (attempt === maxAttempts || !shouldRetry) {
        console.error(`${contextLabel} upload failed`, {
          attempt,
          maxAttempts,
          status,
          message,
        });
        break;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 5000);
      console.warn(`${contextLabel} upload retry scheduled`, {
        attempt,
        nextAttempt: attempt + 1,
        delay,
        status,
        message,
      });
      await sleep(delay);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function hasRangeQueryParam(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('range')) {
      return true;
    }
  } catch {}
  return /[?&]range=/i.test(url);
}


interface EnsureDownloadReadyParams {
  videoId: string;
  initialUrl: string;
  preferredLanguage?: string;
  contextLabel?: string;
}

async function ensureDownloadReady({
  videoId,
  initialUrl,
  preferredLanguage,
  contextLabel = '[YouTube Prepare] Verify',
}: EnsureDownloadReadyParams): Promise<{ url: string } | null> {
  const maxAttempts = Math.max(1, Number(process.env.RAPIDAPI_VERIFY_MAX_ATTEMPTS || 4));
  const baseDelayMs = Math.max(500, Number(process.env.RAPIDAPI_VERIFY_RETRY_DELAY || 1000));
  const headTimeoutMs = Math.max(5000, Number(process.env.RAPIDAPI_VERIFY_HEAD_TIMEOUT || 8000));
  const refreshLimit = Math.max(0, Number(process.env.RAPIDAPI_VERIFY_MAX_REFRESH || 1));

  let currentUrl = initialUrl;
  let refreshes = 0;
  const skipVerification = hasRangeQueryParam(initialUrl);

  if (skipVerification) {
    console.log(`${contextLabel} skipping verification for range-style URL`, {
      videoId,
    });
    return { url: currentUrl };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const allowRangeProbe = !hasRangeQueryParam(currentUrl);
      const ok = await tryHeadRequest(currentUrl, headTimeoutMs, allowRangeProbe);
      if (ok) {
        return { url: currentUrl };
      }
    } catch (error) {
      const status = (error as any)?.status ?? null;
      console.warn(`${contextLabel} verification attempt failed`, {
        videoId,
        attempt,
        status,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (refreshes < refreshLimit) {
      refreshes++;
      console.log(`${contextLabel} refreshing RapidAPI link`, {
        videoId,
        refreshes,
      });
      try {
        if (typeof (YouTubeService as any)?.fetchVideoData === 'function') {
          await (YouTubeService as any).fetchVideoData(videoId, true);
        }
        currentUrl = await YouTubeService.getAudioStreamUrl(videoId, preferredLanguage);
        continue;
      } catch (refreshError) {
        console.error(`${contextLabel} refresh failed`, {
          videoId,
          message: refreshError instanceof Error ? refreshError.message : String(refreshError),
        });
      }
    }

    const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 8000);
    await sleep(delay);
  }

  console.warn(`${contextLabel} verification exhausted attempts`, {
    videoId,
    attempts: maxAttempts,
    refreshes,
  });

  return { url: currentUrl };
}

async function tryHeadRequest(url: string, timeoutMs: number, allowRangeProbe = true): Promise<boolean> {
  const performDirectFetch = async () => {
    const directController = new AbortController();
    const directTimeout = setTimeout(() => directController.abort(), timeoutMs);
    try {
      const directResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
        signal: directController.signal,
      });

      clearTimeout(directTimeout);

      if (!directResponse.ok) {
        const error: any = new Error(`Verification failed with status ${directResponse.status}`);
        error.status = directResponse.status;
        throw error;
      }

      if (directResponse.body) {
        try {
          const reader = directResponse.body.getReader();
          await reader.read();
          await reader.cancel();
        } catch {}
      }

      return true;
    } catch (directError) {
      throw directError;
    } finally {
      clearTimeout(directTimeout);
    }
  };

  if (!allowRangeProbe) {
    return performDirectFetch();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const rangeResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (rangeResponse.status === 200 || rangeResponse.status === 206) {
      return true;
    }

    if (![404, 405, 416].includes(rangeResponse.status)) {
      const error: any = new Error(`Verification failed with status ${rangeResponse.status}`);
      error.status = rangeResponse.status;
      throw error;
    }

    return performDirectFetch();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
