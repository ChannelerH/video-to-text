import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
import { quotaTracker } from '@/services/quota-tracker';
import { db } from '@/db';
import { q_jobs, transcriptions, usage_records } from '@/db/schema';
import { getUniSeq } from '@/lib/hash';
import crypto from 'crypto';
import { and, gte, eq, count, ne } from 'drizzle-orm';
import { computeEstimatedMinutes } from '@/lib/estimate-usage';
import { verifySessionToken } from '@/lib/turnstile-session';

export const maxDuration = 10; // Vercel hobby limit

export async function POST(request: NextRequest) {
  try {
    const abortSignal = request.signal;
    let clientAborted = abortSignal?.aborted ?? false;
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        clientAborted = true;
      });
    }

    // 1. 验证用户（允许匿名预览）
    const maybeUserUuid = await getUserUuid();

    const ipHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const { normalizeIp } = await import('@/lib/turnstile-session');
    const anonIp = normalizeIp(ipHeader.split(',')[0] || '0.0.0.0');
    const anonUsageKey = !maybeUserUuid ? `anon:${anonIp}` : null;

    // 2. 解析请求
    const body = await request.json();
    const { type, content, options: rawOptions = {}, action, turnstileToken, sessionToken } = body;
    
    console.log('[Async API] Request received:', {
      hasUser: !!maybeUserUuid,
      action,
      hasSessionToken: !!sessionToken,
      hasTurnstileToken: !!turnstileToken,
      contentType: type
    });
    const options: Record<string, any> = { ...rawOptions };
    if (options.highAccuracyMode === undefined) {
      const alias = options.high_accuracy ?? options.highAccuracy;
      if (alias !== undefined) {
        options.highAccuracyMode = !!alias;
      }
    }

    // 3. 验证输入
    if (!type || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 匿名预览允许；非预览必须登录
    const isPreview = String(action || '').toLowerCase() === 'preview';
    if (!maybeUserUuid && !isPreview) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For anonymous preview, verify session token or Turnstile token
    if (!maybeUserUuid && isPreview) {
      // 优先使用session token
      if (sessionToken) {
        console.log('[Async] Verifying session token for anonymous preview');
        try {
          // 构建正确的验证URL
          const forwardedFor = request.headers.get('x-forwarded-for');
          const realIp = request.headers.get('x-real-ip');
          const cfConnectingIp = request.headers.get('cf-connecting-ip');
          const { normalizeIp } = await import('@/lib/turnstile-session');
          const clientIp = normalizeIp(
            forwardedFor?.split(',')[0] ||
            realIp ||
            cfConnectingIp ||
            'unknown'
          );

          const { valid, error } = verifySessionToken(sessionToken, clientIp);

          if (!valid) {
            console.log('[Async] Session token invalid, requiring new verification');
            return NextResponse.json(
              { error: error || 'Session expired. Please verify again.' },
              { status: 403 }
            );
          }
          console.log('[Async] Session token valid');
        } catch (error) {
          console.error('[Async] Session verification error:', error);
          return NextResponse.json(
            { error: 'Session verification error. Please try again.' },
            { status: 500 }
          );
        }
      }
      // 后向兼容：如果只有turnstile token，直接验证
      else if (turnstileToken) {
        console.log('[Async] Verifying Turnstile token for anonymous preview (legacy)');
        try {
          const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
          const formData = new URLSearchParams();
          formData.append('secret', process.env.TURNSTILE_SECRET_KEY || '');
          formData.append('response', turnstileToken);
          
          const verifyResponse = await fetch(verifyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
          });
          
          const verifyData = await verifyResponse.json();
          console.log('[Async] Turnstile verification result:', verifyData.success);
          
          if (!verifyData.success) {
            return NextResponse.json(
              { error: 'Verification failed. Please try again.' },
              { status: 403 }
            );
          }
        } catch (error) {
          console.error('[Async] Turnstile verification error:', error);
          return NextResponse.json(
            { error: 'Verification error. Please try again.' },
            { status: 500 }
          );
        }
      }
      // 没有任何验证token
      else {
        console.log('[Async] No verification token provided for anonymous preview');
        return NextResponse.json(
          { error: 'Verification required. Please complete the security check.' },
          { status: 403 }
        );
      }
    }

    const userUuid = maybeUserUuid || '';

    const isHighAccuracyRequest = !!(options?.highAccuracyMode && maybeUserUuid);
    let canUseHighAccuracy = false;

    if (isHighAccuracyRequest) {
      try {
        const { hasHighAccuracyAccess } = await import('@/services/user-tier');
        canUseHighAccuracy = await hasHighAccuracyAccess(userUuid);
      } catch (err) {
        console.warn('[Async] Failed to verify high accuracy access:', err);
      }

      if (!canUseHighAccuracy) {
        return NextResponse.json(
          { error: 'High accuracy mode not available for your plan. Upgrade at /pricing.' },
          { status: 403 }
        );
      }
    }

    const isHighAccuracyActive = isHighAccuracyRequest && canUseHighAccuracy;

    // Get user tier for FREE user audio clipping
    let userTier: UserTier = UserTier.FREE;
    if (userUuid) {
      try {
        userTier = await getUserTier(userUuid);
      } catch (e) {
        console.warn('[Async] Failed to get user tier:', e);
      }
    }

    // 登录用户的额度检查（预览请求跳过）
    if (userUuid && !isPreview) {
      const estimatedMinutes = await estimateUsageMinutes({
        type,
        content,
        userTier,
        userUuid,
        options,
        isHighAccuracy: isHighAccuracyActive
      });

      try {
        const quotaStatus = await quotaTracker.checkQuota(
          userUuid,
          userTier,
          estimatedMinutes,
          isHighAccuracyActive ? 'high_accuracy' : 'standard'
        );

        if (!quotaStatus.isAllowed) {
          return NextResponse.json(
            {
              error: (quotaStatus.reason || 'Quota exceeded') + ' — Upgrade at /pricing',
              quotaInfo: {
                tier: userTier,
                remaining: quotaStatus.remaining,
                usage: quotaStatus.usage
              }
            },
            { status: 429 }
          );
        }
      } catch (quotaErr) {
        console.error('[Async] Quota check failed:', quotaErr);
        return NextResponse.json(
          { error: 'Unable to verify quota. Please try again later.' },
          { status: 503 }
        );
      }
    }

    // 3.2 Anonymous & Free YouTube monthly usage limit
    let shouldRecordAnonYoutubeUsage = false;
    if (type === 'youtube_url') {
      const monthlyLimit = Number(process.env.YOUTUBE_FREE_MONTHLY_LIMIT || process.env.NEXT_PUBLIC_YOUTUBE_FREE_MONTHLY_LIMIT || 3);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      if (!maybeUserUuid) {
        if (anonUsageKey) {
          try {
            const [row] = await db()
              .select({ c: count() })
              .from(usage_records)
              .where(
                and(
                  eq(usage_records.user_id, anonUsageKey),
                  eq(usage_records.model_type, 'anon_youtube'),
                  gte(usage_records.created_at as any, monthStart)
                )
              );
            const used = Number((row as any)?.c || 0);
            if (used >= monthlyLimit) {
              return NextResponse.json(
                {
                  error: `You have reached the ${monthlyLimit}/month YouTube limit. Upgrade your plan or upload the media file instead.`,
                  code: 'youtube_limit_reached'
                },
                { status: 429 }
              );
            }
            shouldRecordAnonYoutubeUsage = true;
          } catch (err) {
            console.warn('[Async] Failed to check anonymous YouTube quota:', err);
          }
        }
      } else if (userTier === UserTier.FREE) {
        try {
          const [row] = await db()
            .select({ c: count() })
            .from(transcriptions)
            .where(
              and(
                eq(transcriptions.user_uuid, userUuid),
                eq(transcriptions.source_type, 'youtube_url'),
                gte(transcriptions.created_at as any, monthStart)
              )
            );
          const used = Number((row as any)?.c || 0);
          if (used >= monthlyLimit) {
            return NextResponse.json(
              {
                error: `You have reached the ${monthlyLimit}/month YouTube limit on the Free plan. Upgrade your plan or upload the media file instead.`,
                code: 'youtube_limit_reached'
              },
              { status: 429 }
            );
          }
        } catch (err) {
          console.warn('[Async] Failed to check free-tier YouTube quota:', err);
        }
      }
    }

    // 3.1 匿名预览限流（按 IP 每日次数）
    if (!maybeUserUuid && isPreview) {
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      try {
        const [row] = await db().select({ c: count() }).from(usage_records)
          .where(and(eq(usage_records.user_id, anonUsageKey!), gte(usage_records.created_at as any, dayStart), eq(usage_records.model_type, 'anon_preview')));
        const used = Number((row as any)?.c || 0);
        // 单变量方案：优先读取 NEXT_PUBLIC_ANON_PREVIEW_DAILY_LIMIT（也可在服务端使用），否则回退 ANON_PREVIEW_DAILY_LIMIT，再回退 10
        const limit = Number(process.env.NEXT_PUBLIC_ANON_PREVIEW_DAILY_LIMIT || process.env.ANON_PREVIEW_DAILY_LIMIT || 10);
        if (used >= limit) {
          return NextResponse.json({ error: `Anonymous preview limit reached (${limit}/day). Please sign in.` }, { status: 429 });
        }
        await db().insert(usage_records).values({ user_id: anonUsageKey!, date: new Date().toISOString().slice(0,10), minutes: '0' as any, model_type: 'anon_preview', created_at: new Date() });
      } catch {}
    }

    if (shouldRecordAnonYoutubeUsage && anonUsageKey) {
      try {
        await db().insert(usage_records).values({
          user_id: anonUsageKey,
          date: new Date().toISOString().slice(0, 10),
          minutes: '0' as any,
          model_type: 'anon_youtube',
          created_at: new Date()
        });
      } catch (err) {
        console.warn('[Async] Failed to record anonymous YouTube usage:', err);
      }
    }

    // 4. 生成任务ID（使用内置序列工具，避免新增依赖）
    const jobId = getUniSeq('job_');
    const sourceHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    const markJobCancelled = async () => {
      try {
        await db().update(transcriptions)
          .set({ status: 'cancelled', completed_at: new Date(), deleted: true })
          .where(eq(transcriptions.job_id, jobId));
      } catch (err) {
        console.warn('[Async] Failed to mark transcription as cancelled', err);
      }
      try {
        await db().update(q_jobs)
          .set({ done: true })
          .where(eq(q_jobs.job_id, jobId));
      } catch {}
    };

    // 确定初始标题
    let initialTitle = 'Processing...';
    
    // 如果是文件上传，使用原始文件名（去掉扩展名）
    if (type === 'file_upload' && options.originalFileName) {
      const fileName = options.originalFileName;
      // 去掉文件扩展名
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      initialTitle = nameWithoutExt;
    }
    // 如果是 YouTube URL，不使用前端传来的 title，因为后端会获取真实视频标题
    else if (type === 'youtube_url') {
      // YouTube 标题会在 prepare/youtube 路由中获取并更新
      // 不使用 options.title，避免覆盖真实标题
      initialTitle = 'YouTube Video';
    }
    // 如果是音频 URL，尝试从 URL 中提取文件名
    else if (type === 'audio_url') {
      // 优先使用 URL 中的文件名，而不是前端传来的 title
      if (content) {
        try {
          const url = new URL(content);
          const pathname = url.pathname;
          const fileName = pathname.split('/').pop() || '';
          if (fileName && fileName !== '') {
            // 去掉文件扩展名
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
            if (nameWithoutExt) {
              initialTitle = decodeURIComponent(nameWithoutExt);
            }
          }
        } catch {
          // URL 解析失败，使用前端传来的 title 作为后备
          if (options.title) {
            initialTitle = options.title;
          }
        }
      }
    }
    // 其他类型使用前端传来的 title
    else if (options.title) {
      initialTitle = options.title;
    }

    // 5. 派发前尽量获取原始总时长，避免后续被裁剪结果覆盖
    let initialOriginalDurationSec = 0;
    let originalDurationCandidate = getDurationFromOptions(options);

    if (!originalDurationCandidate && (type === 'audio_url' || type === 'file_upload')) {
      try {
        // Use music-metadata instead of ffmpeg-based probeDurationSeconds (Vercel compatible)
        const { getDurationFromUrl } = await import('@/lib/audio-duration');
        const duration = await getDurationFromUrl(content);
        if (duration !== null && Number.isFinite(duration) && duration > 0) {
          originalDurationCandidate = duration;
          console.log(`[Async] Extracted duration from ${type}: ${duration.toFixed(2)}s`);
        }
      } catch (err) {
        console.warn('[Async] Failed to extract duration:', err);
      }
    }

    if (typeof originalDurationCandidate === 'number' && Number.isFinite(originalDurationCandidate) && originalDurationCandidate > 0) {
      initialOriginalDurationSec = Math.ceil(originalDurationCandidate);
    }

    // Check upload duration limit (prevent excessively long audio from being transcribed)
    if (originalDurationCandidate) {
      const { getUploadLimitForTier, formatSeconds } = await import('@/lib/duration-limits');
      const uploadLimit = getUploadLimitForTier(userTier, maybeUserUuid);

      if (uploadLimit > 0 && originalDurationCandidate > uploadLimit) {
        console.warn(`[Async] Duration ${originalDurationCandidate}s exceeds ${uploadLimit}s limit for ${userTier || 'anonymous'}`);
        return NextResponse.json({
          success: false,
          error: `Audio duration ${formatSeconds(Math.floor(originalDurationCandidate))} exceeds limit of ${formatSeconds(uploadLimit)}`,
          code: 'duration_limit_exceeded',
          actualDuration: Math.floor(originalDurationCandidate),
          maxDuration: uploadLimit,
          upgradeTier: !maybeUserUuid ? 'Please sign up for more' : (userTier === UserTier.FREE ? 'basic' : 'pro')
        }, { status: 400 });
      }
    }

    // 6. 创建占位transcription记录
    let sourceUrlToSave = (type === 'youtube_url' || type === 'audio_url' || type === 'file_upload') ? content : null;
    
    // Fix potential double protocol issue
    if (sourceUrlToSave) {
      if (sourceUrlToSave.startsWith('https://https://')) {
        console.warn('[Async] Fixing double https:// in source_url:', sourceUrlToSave);
        sourceUrlToSave = sourceUrlToSave.replace('https://https://', 'https://');
      } else if (sourceUrlToSave.startsWith('http://http://')) {
        console.warn('[Async] Fixing double http:// in source_url:', sourceUrlToSave);
        sourceUrlToSave = sourceUrlToSave.replace('http://http://', 'http://');
      }
    }
    
    await db().insert(transcriptions).values({
      job_id: jobId,
      user_uuid: userUuid,
      source_type: type,
      source_hash: sourceHash,
      source_url: sourceUrlToSave,
      title: initialTitle,
      language: options.language || 'auto',
      status: 'queued',
      created_at: new Date(),
      deleted: false,
      duration_sec: 0,
      original_duration_sec: initialOriginalDurationSec,
      cost_minutes: '0'  // numeric类型需要字符串
    }).catch(() => {});

    // 7. 将任务加入队列（用于非供应商异步类型的兜底处理）
    await db().insert(q_jobs).values({
      job_id: jobId,
      tier: userUuid ? String(userTier).toLowerCase() : 'free',
      user_id: userUuid,
      created_at: new Date(),
      done: false
    }).catch(() => {});

    if (clientAborted) {
      await markJobCancelled();
      return NextResponse.json({ success: false, error: 'client_aborted' }, { status: 499 });
    }

    // 8. 立即返回job_id（先构造响应，再异步触发一次处理）
    const resp = NextResponse.json({
      success: true,
      job_id: jobId,
      status: 'processing',
      message: 'Transcription started successfully'
    });

    // 8. 根据 SUPPLIER_ASYNC 配置派发到对应供应商；否则由本地兜底任务处理
    try {
      const origin = new URL(request.url).origin;
      const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
      const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
      const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
      const replicateAllowed = hasReplicate && (supplier === '' || supplier === 'both' || supplier.includes('replicate'));
      const deepgramAllowed = hasDeepgram && (supplier === '' || supplier === 'both' || supplier.includes('deepgram'));

      if (clientAborted) {
        await markJobCancelled();
        return resp;
      }

      if (type === 'audio_url' || type === 'file_upload') {
        let audioUrlForSupplier = content;

        // FREE 用户上传文件时仍需裁剪
        if (type === 'file_upload' && userTier === UserTier.FREE) {
          try {
            const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
            const clippedUrl = await clipAudioForFreeTier(content, jobId, 'file');
            if (clippedUrl) {
              audioUrlForSupplier = clippedUrl;
            }
          } catch (clipErr) {
            console.warn('[Async] Failed to clip audio for free tier:', clipErr);
          }
        }

        const maybeCdnUrl = getSupplierAcceleratedUrl(audioUrlForSupplier, options?.r2Key);
        if (maybeCdnUrl) {
          audioUrlForSupplier = maybeCdnUrl;
        }

        try {
          if (audioUrlForSupplier) {
            await db().update(transcriptions)
              .set({ processed_url: audioUrlForSupplier })
              .where(eq(transcriptions.job_id, jobId));
          }
        } catch (err) {
          console.warn('[Async] Failed to persist processed_url', err);
        }

        const callbackBase = process.env.CALLBACK_BASE_URL || origin;
        const shouldUseReplicate = isHighAccuracyActive && replicateAllowed;
        const shouldUseDeepgram = !isHighAccuracyActive && deepgramAllowed;
        const fallbackToReplicate = !shouldUseDeepgram && !deepgramAllowed && replicateAllowed && !isHighAccuracyActive;
        const enableDiarization = !!options?.enableDiarizationAfterWhisper && ['basic', 'pro', 'premium'].includes(String(userTier).toLowerCase());

        if (shouldUseReplicate || fallbackToReplicate) {
          try {
            const cbUrl = new URL(`${callbackBase}/api/callback/replicate`);
            cbUrl.searchParams.set('job_id', jobId);
            if (isHighAccuracyActive) {
              cbUrl.searchParams.set('ha', '1');
            } else if (fallbackToReplicate) {
              cbUrl.searchParams.set('dg_missing', '1');
            }
            if (enableDiarization) cbUrl.searchParams.set('dw', '1');

            const replicateVersion = process.env.REPLICATE_WHISPER_VERSION || 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e';
            const payload: Record<string, any> = {
              version: replicateVersion,
              input: {
                audio: audioUrlForSupplier,
                audio_file: audioUrlForSupplier,
                model: 'large-v3',
                diarize: false,
                translate: false
              },
              webhook: cbUrl.toString(),
              webhook_events_filter: ['completed']
            };

            const resp = await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            if (!resp.ok) {
              const text = await resp.text().catch(() => '');
              console.error('[Async] Replicate enqueue failed', resp.status, text);
            }

            await db().update(transcriptions)
              .set({ status: 'transcribing' })
              .where(and(eq(transcriptions.job_id, jobId), ne(transcriptions.status, 'cancelled')));
          } catch (err) {
            console.error('[Async] Failed to dispatch Replicate job:', err);
          }
        }

        if (shouldUseDeepgram) {
          try {
            let cb = `${callbackBase}/api/callback/deepgram?job_id=${encodeURIComponent(jobId)}`;
            if (process.env.DEEPGRAM_WEBHOOK_SECRET) {
              const sig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(jobId).digest('hex');
              cb = `${cb}&cb_sig=${sig}`;
            }
            const params = new URLSearchParams();
            params.set('callback', cb);
            params.set('paragraphs', 'true');
            params.set('punctuate', 'true');
            params.set('model', 'nova-2');
            params.set('detect_language', 'true');
            if (enableDiarization) {
              params.set('utterances', 'true');
              params.set('diarize', 'true');
            }
            const deepgramResponse = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
              method: 'POST',
              headers: {
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ url: audioUrlForSupplier })
            });
            
            const responseText = await deepgramResponse.text();
            
            if (!deepgramResponse.ok) {
              console.error('[Async] Deepgram enqueue failed', deepgramResponse.status, responseText);
            }

            await db().update(transcriptions).set({ status: 'transcribing' }).where(eq(transcriptions.job_id, jobId));
          } catch (err) {
            console.error('[Async] Failed to dispatch Deepgram job:', err);
          }
        }

        const dispatchedToExternal = (shouldUseReplicate || shouldUseDeepgram || fallbackToReplicate);

        if (!dispatchedToExternal) {
          if (process.env.PROCESS_ONE_FALLBACK === 'true') {
            fetch(`${origin}/api/transcribe/process-one`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ job_id: jobId })
            }).catch(() => {});
          } else {
            console.error('[Async] No transcription supplier configured and fallback disabled. jobId=', jobId);

            await db().update(transcriptions)
              .set({ status: 'failed' })
              .where(eq(transcriptions.job_id, jobId));

            await db().update(q_jobs)
              .set({ done: true })
              .where(eq(q_jobs.job_id, jobId));

            return NextResponse.json({
              success: false,
              job_id: jobId,
              error: 'Transcription engine not configured',
              code: 'supplier_unavailable'
            }, { status: 503 });
          }
        }
      } else if (type === 'youtube_url') {
        fetch(`${origin}/api/transcribe/prepare/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            video: content,
            user_tier: userTier,
            preferred_language: options?.preferred_language,
            enable_diarization_after_whisper: options?.enableDiarizationAfterWhisper === true,
            high_accuracy: isHighAccuracyRequest
          })
        }).catch(() => {});
      }
    } catch (dispatchError) {
      console.error('[Async] Supplier dispatch error:', dispatchError);
    }

    return resp;

  } catch (error) {
    console.error('[Transcribe Async] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start transcription' },
      { status: 500 }
    );
  }
}

type EstimateUsageParams = {
  type: 'youtube_url' | 'file_upload' | 'audio_url';
  content: string;
  userTier: UserTier;
  userUuid: string;
  options: Record<string, any> | undefined;
  isHighAccuracy: boolean;
};

async function estimateUsageMinutes(params: EstimateUsageParams) {
  const { type, content, userTier, userUuid, options, isHighAccuracy } = params;
  return computeEstimatedMinutes({
    type,
    content,
    userTier,
    options,
    userUuid,
    modelType: isHighAccuracy ? 'high_accuracy' : 'standard'
  });
}

function getDurationFromOptions(options: Record<string, any> | undefined): number | null {
  if (!options) return null;
  const candidates = [
    options.originalDurationSec,
    options.estimatedDurationSec,
    options.probedDurationSec,
    options.durationSec,
    options.duration_seconds,
    options.metadata?.duration,
    options.videoInfo?.duration,
    options.videoInfo?.lengthSeconds
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function getSupplierAcceleratedUrl(originalUrl: string | null | undefined, r2Key?: string | null): string | null {
  if (!originalUrl) return null;

  const cdnBaseRaw = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
  if (!cdnBaseRaw) return null;

  let cdnBase: URL;
  try {
    cdnBase = new URL(cdnBaseRaw);
  } catch (err) {
    console.warn('[Async] Invalid STORAGE_DOMAIN provided, skip CDN rewrite:', err);
    return null;
  }

  const trimmedBase = cdnBase.origin + (cdnBase.pathname.replace(/\/$/, ''));
  if (!trimmedBase) return null;

  const normalizedKey = typeof r2Key === 'string' && r2Key.trim().length > 0
    ? r2Key.replace(/^\/+/, '')
    : null;

  if (normalizedKey) {
    return `${trimmedBase}/${normalizedKey}`;
  }

  let parsedSource: URL;
  try {
    parsedSource = new URL(originalUrl);
  } catch {
    return null;
  }

  if (parsedSource.hostname === cdnBase.hostname) {
    return originalUrl;
  }

  const isR2Host = parsedSource.hostname.endsWith('.r2.cloudflarestorage.com')
    || parsedSource.hostname.endsWith('.cloudflarestorage.com');

  if (!isR2Host) {
    return null;
  }

  const path = parsedSource.pathname.replace(/^\/+/, '');
  if (!path) {
    return null;
  }

  return `${trimmedBase}/${path}`;
}
