import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
import { quotaTracker } from '@/services/quota-tracker';
import { db } from '@/db';
import { q_jobs, transcriptions, usage_records } from '@/db/schema';
import { getUniSeq } from '@/lib/hash';
import crypto from 'crypto';
import { and, gte, eq, count } from 'drizzle-orm';
import { computeEstimatedMinutes } from '@/lib/estimate-usage';

export const maxDuration = 10; // Vercel hobby limit

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户（允许匿名预览）
    const maybeUserUuid = await getUserUuid();

    // 2. 解析请求
    const body = await request.json();
    const { type, content, options = {}, action } = body;

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

    // 3.1 匿名预览限流（按 IP 每日次数）
    if (!maybeUserUuid && isPreview) {
      const ipHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
      const ip = ipHeader.split(',')[0].trim() || '0.0.0.0';
      const anonId = `anon:${ip}`;
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      try {
        const [row] = await db().select({ c: count() }).from(usage_records)
          .where(and(eq(usage_records.user_id, anonId), gte(usage_records.created_at as any, dayStart), eq(usage_records.model_type, 'anon_preview')));
        const used = Number((row as any)?.c || 0);
        // 单变量方案：优先读取 NEXT_PUBLIC_ANON_PREVIEW_DAILY_LIMIT（也可在服务端使用），否则回退 ANON_PREVIEW_DAILY_LIMIT，再回退 10
        const limit = Number(process.env.NEXT_PUBLIC_ANON_PREVIEW_DAILY_LIMIT || process.env.ANON_PREVIEW_DAILY_LIMIT || 10);
        if (used >= limit) {
          return NextResponse.json({ error: `Anonymous preview limit reached (${limit}/day). Please sign in.` }, { status: 429 });
        }
        await db().insert(usage_records).values({ user_id: anonId, date: new Date().toISOString().slice(0,10), minutes: '0' as any, model_type: 'anon_preview', created_at: new Date() });
      } catch {}
    }

    // 4. 生成任务ID（使用内置序列工具，避免新增依赖）
    const jobId = getUniSeq('job_');
    const sourceHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    // 确定初始标题
    let initialTitle = options.title || 'Processing...';
    
    // 如果是文件上传，使用原始文件名（去掉扩展名）
    if (type === 'file_upload' && options.originalFileName) {
      const fileName = options.originalFileName;
      // 去掉文件扩展名
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      initialTitle = nameWithoutExt;
    }
    // 如果是 YouTube URL，可以稍后从视频信息中获取标题
    else if (type === 'youtube_url') {
      // YouTube 标题会在 prepare/youtube 路由中获取并更新
      initialTitle = 'YouTube Video';
    }
    // 如果是音频 URL，尝试从 URL 中提取文件名
    else if (type === 'audio_url' && content) {
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
        // URL 解析失败，保持默认标题
      }
    }

    // 5. 创建占位transcription记录
    await db().insert(transcriptions).values({
      job_id: jobId,
      user_uuid: userUuid,
      source_type: type,
      source_hash: sourceHash,
      source_url: (type === 'youtube_url' || type === 'audio_url' || type === 'file_upload') ? content : null,
      title: initialTitle,
      language: options.language || 'auto',
      status: 'queued',
      created_at: new Date(),
      deleted: false,
      duration_sec: 0,
      original_duration_sec: 0,
      cost_minutes: '0'  // numeric类型需要字符串
    }).catch(() => {});

    // 6. 将任务加入队列（用于非供应商异步类型的兜底处理）
    await db().insert(q_jobs).values({
      job_id: jobId,
      tier: userUuid ? String(userTier).toLowerCase() : 'free',
      user_id: userUuid,
      created_at: new Date(),
      done: false
    }).catch(() => {});

    // 7. 立即返回job_id（先构造响应，再异步触发一次处理）
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

      if (type === 'audio_url' || type === 'file_upload') {
        let audioUrlForSupplier = content;

        // FREE 用户上传文件时仍需裁剪
        if (type === 'file_upload' && userTier === UserTier.FREE) {
          try {
            const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
            const clippedUrl = await clipAudioForFreeTier(content, jobId, 'file');
            if (clippedUrl) {
              audioUrlForSupplier = clippedUrl;
              await db().update(transcriptions)
                .set({ processed_url: audioUrlForSupplier })
                .where(eq(transcriptions.job_id, jobId));
            }
          } catch (clipErr) {
            console.warn('[Async] Failed to clip audio for free tier:', clipErr);
          }
        }

        const callbackBase = process.env.CALLBACK_BASE_URL || origin;
        const shouldUseReplicate = (isHighAccuracyRequest && hasReplicate) || ((supplier.includes('replicate') || supplier === 'both') && hasReplicate);
        const shouldUseDeepgram = !isHighAccuracyRequest && hasDeepgram && (supplier.includes('deepgram') || supplier === 'both' || supplier === '');

        if (shouldUseReplicate) {
          try {
            const cbUrl = new URL(`${callbackBase}/api/callback/replicate`);
            cbUrl.searchParams.set('job_id', jobId);
            if (isHighAccuracyRequest) cbUrl.searchParams.set('ha', '1');

            await fetch('https://api.replicate.com/v1/predictions', {
              method: 'POST',
              headers: {
                'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
                input: { audio_file: audioUrlForSupplier, model: 'large-v3' },
                webhook: cbUrl.toString(),
                webhook_events_filter: ['completed', 'failed'],
                ...(process.env.REPLICATE_WEBHOOK_SECRET ? { webhook_secret: process.env.REPLICATE_WEBHOOK_SECRET } : {})
              })
            });

            await db().update(transcriptions).set({ status: 'transcribing' }).where(eq(transcriptions.job_id, jobId));
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
            params.set('utterances', 'true');
            params.set('model', 'nova-2');
            params.set('detect_language', 'true');

            await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
              method: 'POST',
              headers: {
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ url: audioUrlForSupplier })
            });

            await db().update(transcriptions).set({ status: 'transcribing' }).where(eq(transcriptions.job_id, jobId));
          } catch (err) {
            console.error('[Async] Failed to dispatch Deepgram job:', err);
          }
        }

        if (!shouldUseReplicate && !shouldUseDeepgram && process.env.PROCESS_ONE_FALLBACK === 'true') {
          fetch(`${origin}/api/transcribe/process-one`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId })
          }).catch(() => {});
        }
      } else if (type === 'youtube_url') {
        fetch(`${origin}/api/transcribe/prepare/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            video: content,
            user_tier: userTier,
            preferred_language: options?.preferred_language
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
