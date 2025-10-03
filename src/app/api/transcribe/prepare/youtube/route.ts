
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Readable } from 'stream';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { and, eq, ne, desc, isNotNull } from 'drizzle-orm';
import { CloudflareR2Service } from '@/lib/r2-upload';
import { POLICY } from '@/services/policy';

export const runtime = 'nodejs';
export const maxDuration = 10; // keep it short

export async function POST(request: NextRequest) {
  let job_id: string | undefined;
  try {
    const body = await request.json();
    ({ job_id } = body);
    const { video, user_tier, preferred_language, enable_diarization_after_whisper, high_accuracy, video_prefetch, clip_seconds, is_preview } = body;
    const forceHighAccuracy = high_accuracy === true;
    console.log('[YouTube Prepare] incoming request', {
      job_id,
      hasVideo: typeof video === 'string' && video.length > 0,
      user_tier,
      preferred_language,
      enable_diarization_after_whisper,
      high_accuracy: forceHighAccuracy,
    });
    if (!job_id || !video) {
      return NextResponse.json({ error: 'missing job_id or video' }, { status: 400 });
    }

    const [currentTranscription] = await db()
      .select({
        status: transcriptions.status,
        user_uuid: transcriptions.user_uuid,
        original_duration_sec: transcriptions.original_duration_sec,
      })
      .from(transcriptions)
      .where(eq(transcriptions.job_id, job_id))
      .limit(1);

    if (!currentTranscription) {
      return NextResponse.json({ error: 'transcription_not_found' }, { status: 404 });
    }

    if (currentTranscription.status === 'cancelled') {
      console.log('[YouTube Prepare] Job already cancelled, skipping prepare:', job_id);
      return NextResponse.json({ cancelled: true, success: false });
    }

    const jobUserUuid = (currentTranscription.user_uuid || '').trim() || null;
    const recordedOriginalDuration = Number(currentTranscription.original_duration_sec);
    const jobOriginalDuration = Number.isFinite(recordedOriginalDuration) && recordedOriginalDuration > 0
      ? recordedOriginalDuration
      : null;

    const clipSecondsOverride = typeof clip_seconds === 'number' && Number.isFinite(clip_seconds)
      ? clip_seconds
      : null;
    const isPreviewRequest = is_preview === true;
    const effectiveClipSeconds = await determineClipSecondsForYoutube({
      userTier: user_tier,
      userUuid: jobUserUuid,
      clipSecondsOverride,
      isPreview: isPreviewRequest,
    });

    // Check if this is already an R2/processed URL (from Re-run)
    const isProcessedUrl = video.includes('.r2.dev/') || video.includes('pub-') || video.includes('/api/media/proxy');
    
    if (isProcessedUrl) {
      
      // Directly use the R2 URL as supplier URL
      let supplierAudioUrl = video;
      
      // For FREE users, need to clip the R2 URL
      if (effectiveClipSeconds && shouldClipMedia(jobOriginalDuration, effectiveClipSeconds)) {
        const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
        const clipped = await clipAudioForFreeTier(video, job_id, 'rerun', effectiveClipSeconds);

        if (clipped?.url) {
          supplierAudioUrl = clipped.url;
        } else {
          // Fall back to full audio
        }
      }
      
      // Store the URL and proceed to Deepgram
      if (job_id) {
        try {
          await db().update(transcriptions)
            .set({ processed_url: supplierAudioUrl })
            .where(and(eq(transcriptions.job_id, job_id), ne(transcriptions.status, 'cancelled')));
        } catch (e) {
          console.error('[YouTube Prepare] DB update failed:', e);
        }
      }
      
      // Send to Deepgram
      const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
      const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
      const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
      const replicateAllowed = hasReplicate && (supplier === '' || supplier === 'both' || supplier.includes('replicate'));
      const deepgramAllowed = hasDeepgram && (supplier === '' || supplier === 'both' || supplier.includes('deepgram'));
      const { shouldUseDeepgram, shouldUseReplicate, fallbackToReplicate } = resolveSupplierStrategy({
        forceHighAccuracy,
        deepgramAllowed,
        replicateAllowed,
        supplierAudioUrl,
      });
      const origin = new URL(request.url).origin;
      const cbBase = process.env.CALLBACK_BASE_URL || origin;
      
      const enableDiarization = !!enable_diarization_after_whisper && ['basic', 'pro', 'premium'].includes(String(user_tier).toLowerCase());
      console.log('[YouTube Prepare] processed-url branch', {
        enableDiarization,
        supplier,
        hasDeepgramKey: hasDeepgram,
        supplierAudioUrl,
        high_accuracy: forceHighAccuracy,
        deepgramAllowed,
        replicateAllowed,
        shouldUseDeepgram,
        shouldUseReplicate,
        fallbackToReplicate,
      });

      const processedTasks: Promise<any>[] = [];
      const processedDispatchResult = await enqueueSuppliers({
        jobId: job_id,
        supplierAudioUrl,
        cbBase,
        enableDiarization,
        forceHighAccuracy,
        shouldUseDeepgram,
        shouldUseReplicate,
        fallbackToReplicate,
        contextLabel: '[YouTube Prepare][Processed]',
        tasks: processedTasks,
      });

      if (processedDispatchResult) {
        return processedDispatchResult;
      }

      settleSupplierTasks(job_id, processedTasks, '[YouTube Prepare][Processed]');
      return NextResponse.json({ ok: true, rerun: true });
    }
    
    // Normal YouTube URL processing
    const { YouTubeService } = await import('@/lib/youtube');
    
    let vid: string | null = null;
    let audioUrl: string = '';
    let videoTitle: string | null = null;
    let videoDurationSeconds: number | null = null;

    const prefetched = parseVideoPrefetch(video_prefetch);

    try {
      vid = YouTubeService.validateAndParseUrl(video) || String(video);
    } catch (error) {
      console.error('[YouTube Prepare] Failed to parse YouTube URL:', error);
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    const variantSuffix = forceHighAccuracy ? ':ha1' : ':ha0';
    const reusable = vid
      ? (await findReusableAudioForVideo(vid, variantSuffix))
          || (variantSuffix !== ':ha0' ? await findReusableAudioForVideo(vid, ':ha0') : null)
      : null;
    let supplierAudioUrl: string | null = reusable?.processedUrl ?? null;
    if (reusable) {
      audioUrl = reusable.processedUrl;
      videoTitle = reusable.title || null;
      videoDurationSeconds = reusable.originalDurationSec ?? null;
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
        audioUrl = await YouTubeService.getAudioStreamUrl(vid, preferred_language);
      } catch (error) {
        // Fallback 1: use optimized audio formats (but try to respect language preference)
        try {
          const fmts = await YouTubeService.getOptimizedAudioFormats(vid, preferred_language);
          const pick = fmts.find(f => !!f.url) || fmts[0];
          if (pick?.url) {
            audioUrl = pick.url;
          }
        } catch (e) {
        }

        if (!audioUrl) {
          console.warn('[YouTube Prepare] Failed to resolve audio URL, prompting manual upload');

          if (job_id) {
            try {
              await db().update(transcriptions)
                .set({
                  status: 'failed',
                  processed_url: 'download_failed:manual_upload_required',
                  completed_at: new Date()
                })
                .where(and(eq(transcriptions.job_id, job_id), ne(transcriptions.status, 'cancelled')));
            } catch (updateError) {
              console.error('[YouTube Prepare] Failed to mark transcription as download_failed:', updateError);
            }
          }

          return NextResponse.json({
            ok: false,
            error: 'youtube_manual_upload_required'
          }, { status: 502 });
        }
      }
    }

    if (!supplierAudioUrl) {
      try {
        const r2 = new CloudflareR2Service();
        const cfg = r2.validateConfig();
        if (!cfg.isValid) {
          console.warn('[YouTube Prepare] R2 not configured properly:', cfg);
        } else {
          if (!videoTitle || !videoDurationSeconds) {
            try {
              const info = await YouTubeService.getVideoInfo(vid!);
              videoTitle = videoTitle || info.title || null;
              videoDurationSeconds = videoDurationSeconds || info.duration || null;
            } catch (error) {
              console.error('[YouTube Prepare] Failed to get video info:', error);
            }
          }

          // Check YouTube video duration limit
          if (videoDurationSeconds && videoDurationSeconds > 0) {
            const { getUploadLimitForTier, formatSeconds } = await import('@/lib/duration-limits');
            // For YouTube, we don't have userUuid here, use tier string directly
            const uploadLimit = getUploadLimitForTier(user_tier as any, undefined);

            const skipDurationLimit = effectiveClipSeconds && shouldClipMedia(videoDurationSeconds, effectiveClipSeconds);

            if (!skipDurationLimit && uploadLimit > 0 && videoDurationSeconds > uploadLimit) {
              console.warn(`[YouTube Prepare] Video duration ${videoDurationSeconds}s exceeds ${uploadLimit}s limit for ${user_tier}`);

              // Mark job as failed
              if (job_id) {
                await db().update(transcriptions)
                  .set({
                    status: 'failed',
                    completed_at: new Date()
                  })
                  .where(eq(transcriptions.job_id, job_id));
              }

              return NextResponse.json({
                ok: false,
                error: `Video duration ${formatSeconds(Math.floor(videoDurationSeconds))} exceeds limit of ${formatSeconds(uploadLimit)}`,
                code: 'duration_limit_exceeded',
                actualDuration: Math.floor(videoDurationSeconds),
                maxDuration: uploadLimit,
                suggestion: user_tier === 'free' ? 'Upgrade to Basic for longer videos' : 'Please try a shorter video'
              }, { status: 400 });
            }
          }

          const resolveAudioUrl = async () => {
            if (audioUrl) return audioUrl;
            audioUrl = await YouTubeService.getAudioStreamUrl(vid!, preferred_language);
            return audioUrl;
          };

          const isFreeTier = String(user_tier).toLowerCase() === 'free';
          const finalUrl = await resolveAudioUrl();
          console.log('[YouTube Prepare] Resolved audio URL from RapidAPI', {
            videoId: vid,
            finalUrl,
            fromCache: !!reusable,
            throughPrefetch: !!prefetched,
          });
          const needsClipPreview = isFreeTier
            && effectiveClipSeconds
            && shouldClipMedia(videoDurationSeconds ?? jobOriginalDuration, effectiveClipSeconds);

          if (needsClipPreview) {
            const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
            const clipped = await clipAudioForFreeTier(finalUrl, job_id, 'youtube', effectiveClipSeconds);
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
                videoId: vid!,
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
      } catch (e: any) {
        console.error('[YouTube Prepare] Failed to upload to R2:', e);
        // Don't fail the whole request, continue with direct YouTube URL if available
      }
    }

    // Store processed URL and title separately (keep original source_url intact)
    try {
      const processedUrl = supplierAudioUrl || audioUrl;
      
      // Build update object
      const updateData: any = { processed_url: processedUrl };
      
      // Update title if we got it from YouTube
      if (videoTitle) {
        updateData.title = videoTitle;
      }
      
      // Update original duration if we got it from YouTube (important for preview detection)
      if (videoDurationSeconds && videoDurationSeconds > 0) {
        updateData.original_duration_sec = videoDurationSeconds;
        console.log('[YouTube Prepare] Storing original duration:', videoDurationSeconds, 'seconds');
      }
      
      // Update both processed_url and title (if available)
      if (!job_id) {
        throw new Error('job_id is required for database update');
      }
      await db().update(transcriptions)
        .set(updateData)
        .where(and(eq(transcriptions.job_id, job_id), ne(transcriptions.status, 'cancelled')));
    } catch (e) {
      console.error('[YouTube Prepare] DB update failed:', e);
      return NextResponse.json({ error: 'db_update_failed' }, { status: 500 });
    }

    // Fan out to suppliers according to env
    const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
    const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
    const replicateAllowed = hasReplicate && (supplier === '' || supplier === 'both' || supplier.includes('replicate'));
    const deepgramAllowed = hasDeepgram && (supplier === '' || supplier === 'both' || supplier.includes('deepgram'));
    const origin = new URL(request.url).origin;
    const cbBase = process.env.CALLBACK_BASE_URL || origin;
    // Provide suppliers with preferred R2 URL; fallback to our proxy URL if R2 not available
    const youtubeWatchUrl = `https://www.youtube.com/watch?v=${vid}`;
    const proxyUrl = `${origin}/api/media/proxy?url=${encodeURIComponent(youtubeWatchUrl)}`;
    const supplierUrl = supplierAudioUrl || proxyUrl;

    const tasks: Promise<any>[] = [];

    // Only send to Deepgram if we have a public R2 URL (proxy URL is not accessible from outside)
    const enableDiarization = !!enable_diarization_after_whisper && ['basic', 'pro', 'premium'].includes(String(user_tier).toLowerCase());

    const { shouldUseDeepgram, shouldUseReplicate, fallbackToReplicate } = resolveSupplierStrategy({
      forceHighAccuracy,
      deepgramAllowed,
      replicateAllowed,
      supplierAudioUrl,
    });

    console.log('[YouTube Prepare] fanout', {
      supplier,
      hasDeepgramKey: hasDeepgram,
      hasReplicateKey: hasReplicate,
      supplierAudioUrl,
      enableDiarization,
      forceHighAccuracy,
      deepgramAllowed,
      replicateAllowed,
      shouldUseDeepgram,
      shouldUseReplicate,
      fallbackToReplicate,
    });

    const dispatchResult = await enqueueSuppliers({
      jobId: job_id,
      supplierAudioUrl,
      cbBase,
      enableDiarization,
      forceHighAccuracy,
      shouldUseDeepgram,
      shouldUseReplicate,
      fallbackToReplicate,
      contextLabel: '[YouTube Prepare][Fanout]',
      tasks,
    });

    if (dispatchResult) {
      return dispatchResult;
    }

    // Check if we have at least one supplier task or a valid URL
    if (tasks.length === 0 && !supplierAudioUrl) {
      // No supplier can be called, mark as failed
      console.error('[YouTube Prepare] No supplier available, marking job as failed');
      if (job_id) {
        await db().update(transcriptions)
          .set({ 
            status: 'failed',
            completed_at: new Date()
          })
          .where(and(eq(transcriptions.job_id, job_id), ne(transcriptions.status, 'cancelled')));
      }
      
      return NextResponse.json({ ok: true, warning: 'prepare_failed' });
    }

    settleSupplierTasks(job_id, tasks, '[YouTube Prepare]');

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[YouTube Prepare] Uncaught error:', e);
    
    // Update database status to failed
    if (job_id) {
      try {
        await db().update(transcriptions)
          .set({ 
            status: 'failed',
            completed_at: new Date()
          })
          .where(and(eq(transcriptions.job_id, job_id), ne(transcriptions.status, 'cancelled')));
      } catch (dbError) {
        console.error('[YouTube Prepare] Failed to update error status:', dbError);
      }
    }
    
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 });
  }
}

interface UploadAudioUrlToR2Params {
  sourceUrl: string;
  videoId: string;
  r2?: CloudflareR2Service;
  contextLabel?: string;
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
  const targetPublicUrl = `${publicUrlBase}/${key}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const attemptStreamUpload = async () => {
    console.log(`${contextLabel} Attempting stream upload`, {
      videoId,
      key,
      publicUrlBase,
      sourceUrl,
    });
    const response = await fetch(sourceUrl, { headers });
    console.log(`${contextLabel} Source fetch response`, {
      videoId,
      status: response.status,
      statusText: response.statusText,
      url: sourceUrl,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch audio stream (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || 'audio/webm';
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

    if (!response.body || !contentLength || !Number.isFinite(contentLength) || contentLength <= 0) {
      console.log(`${contextLabel} Stream metadata incomplete, switching to buffered upload`, {
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
      console.log(`${contextLabel} Buffered upload via helper succeeded`, {
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
    }));
    console.log(`${contextLabel} Stream upload to R2 succeeded`, {
      videoId,
      key,
      targetPublicUrl,
      contentType,
      contentLength,
    });
    return targetPublicUrl;
  };

  try {
    return await attemptStreamUpload();
  } catch (streamError) {
    console.error(`${contextLabel} Stream upload failed, retrying with buffered upload`, streamError);
    try {
      const response = await fetch(sourceUrl, { headers });
      console.log(`${contextLabel} Buffered retry response`, {
        videoId,
        status: response.status,
        statusText: response.statusText,
        url: sourceUrl,
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio stream (${response.status})`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'audio/webm';
      const service = r2 ?? new CloudflareR2Service();
      const upload = await service.uploadFile(buffer, `${videoId}.webm`, contentType, {
        folder: 'youtube-audio',
        expiresIn: 24,
        makePublic: true,
      });
      console.log(`${contextLabel} Buffered upload retry succeeded`, {
        videoId,
        key: upload.key,
        publicUrl: upload.publicUrl,
      });
      return upload.publicUrl || upload.url;
    } catch (bufferError) {
      console.error(`${contextLabel} Buffered upload failed`, {
        videoId,
        sourceUrl,
        error: bufferError,
      });
      return null;
    }
  }
}

interface SupplierStrategyOptions {
  forceHighAccuracy: boolean;
  deepgramAllowed: boolean;
  replicateAllowed: boolean;
  supplierAudioUrl: string | null;
}

interface SupplierDispatchOptions {
  jobId: string;
  supplierAudioUrl: string | null;
  cbBase: string;
  enableDiarization: boolean;
  forceHighAccuracy: boolean;
  shouldUseDeepgram: boolean;
  shouldUseReplicate: boolean;
  fallbackToReplicate: boolean;
  contextLabel: string;
  tasks: Promise<any>[];
}

function resolveSupplierStrategy({
  forceHighAccuracy,
  deepgramAllowed,
  replicateAllowed,
  supplierAudioUrl,
}: SupplierStrategyOptions) {
  const hasSupplierAudio = !!supplierAudioUrl;
  const shouldUseDeepgram = !forceHighAccuracy && deepgramAllowed && hasSupplierAudio;
  const shouldUseReplicate = forceHighAccuracy && replicateAllowed && hasSupplierAudio;
  const fallbackToReplicate =
    !shouldUseDeepgram && !deepgramAllowed && replicateAllowed && !forceHighAccuracy && hasSupplierAudio;

  return { shouldUseDeepgram, shouldUseReplicate, fallbackToReplicate };
}

async function enqueueSuppliers(options: SupplierDispatchOptions): Promise<NextResponse | null> {
  const {
    jobId,
    supplierAudioUrl,
    cbBase,
    enableDiarization,
    forceHighAccuracy,
    shouldUseDeepgram,
    shouldUseReplicate,
    fallbackToReplicate,
    contextLabel,
    tasks,
  } = options;

  if (!supplierAudioUrl) {
    return null;
  }

  if (shouldUseDeepgram) {
    if (await isJobCancelled(jobId)) {
      console.log(`${contextLabel} Cancelled before Deepgram dispatch, skip:`, jobId);
      return NextResponse.json({ cancelled: true, success: false });
    }

    let cb = `${cbBase}/api/callback/deepgram?job_id=${encodeURIComponent(jobId)}`;
    if (process.env.DEEPGRAM_WEBHOOK_SECRET) {
      const sig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(jobId).digest('hex');
      cb = `${cb}&cb_sig=${sig}`;
    }

    const params = new URLSearchParams();
    params.set('callback', cb);
    params.set('callback_method', 'POST');

    tasks.push(
      (async () => {
        const params2 = new URLSearchParams();
        params2.set('callback', cb);
        params2.set('paragraphs', 'true');
        params2.set('punctuate', 'true');
        params2.set('model', 'nova-2');
        params2.set('detect_language', 'true');
        if (enableDiarization) {
          params2.set('utterances', 'true');
          params2.set('diarize', 'true');
        }
        console.log(`${contextLabel} Deepgram params`, {
          params: params2.toString(),
          enableDiarization,
          callback: cb,
        });

        try {
          const resp = await fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: supplierAudioUrl }),
            signal: AbortSignal.timeout(30000),
          });

          if (!resp.ok) {
            const text = await resp.text();
            console.error(`${contextLabel} Deepgram enqueue failed`, resp.status, text);
          } else {
            console.log(`${contextLabel} Deepgram enqueue success`);
          }
        } catch (error) {
          console.error(`${contextLabel} Deepgram enqueue error`, error);
        }
      })()
    );
  }

  if (shouldUseReplicate || fallbackToReplicate) {
    if (await isJobCancelled(jobId)) {
      console.log(`${contextLabel} Cancelled before Replicate dispatch, skip:`, jobId);
      return NextResponse.json({ cancelled: true, success: false });
    }

    const cbUrl = new URL(`${cbBase}/api/callback/replicate`);
    cbUrl.searchParams.set('job_id', jobId);
    if (enableDiarization) cbUrl.searchParams.set('dw', '1');
    if (forceHighAccuracy) {
      cbUrl.searchParams.set('ha', '1');
    } else if (fallbackToReplicate) {
      cbUrl.searchParams.set('dg_missing', '1');
    }
    const cb = cbUrl.toString();

    tasks.push(
      (async () => {
        try {
          const replicateVersion =
            process.env.REPLICATE_WHISPER_VERSION ||
            'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e';
          const payload: Record<string, any> = {
            version: replicateVersion,
            input: {
              audio: supplierAudioUrl,
              audio_file: supplierAudioUrl,
              model: 'large-v3',
              diarize: false,
              translate: false,
            },
            webhook: cb,
            webhook_events_filter: ['completed'],
          };

          const resp = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            console.error(`${contextLabel} Replicate enqueue failed`, resp.status, text);
          }
        } catch (error) {
          console.error(`${contextLabel} Replicate enqueue error`, error);
        }
      })()
    );
  }

  return null;
}

function settleSupplierTasks(jobId: string, tasks: Promise<any>[], contextLabel: string) {
  if (!tasks.length) {
    return;
  }

  Promise.allSettled(tasks)
    .then(results => {
      const allFailed = results.every(result => result.status === 'rejected');
      if (allFailed && results.length > 0) {
        console.error(`${contextLabel} All supplier tasks failed`);
        db().update(transcriptions)
          .set({
            status: 'failed',
            completed_at: new Date(),
          })
          .where(and(eq(transcriptions.job_id, jobId), ne(transcriptions.status, 'cancelled')))
          .catch(err => console.error(`${contextLabel} Failed to update status:`, err));
      }
    })
    .catch(error => console.warn(`${contextLabel} Fan-out settle failed:`, error));
}

async function isJobCancelled(jobId: string): Promise<boolean> {
  const [statusCheck] = await db()
    .select({ status: transcriptions.status })
    .from(transcriptions)
    .where(eq(transcriptions.job_id, jobId))
    .limit(1);

  return statusCheck?.status === 'cancelled';
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

function parseVideoPrefetch(raw: any): PrefetchedVideoPayload | null {
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

async function determineClipSecondsForYoutube(params: {
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

function shouldClipMedia(originalDurationSeconds: number | null, limitSeconds: number): boolean {
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
