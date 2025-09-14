import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@/lib/transcription';
import { transcriptionCache } from '@/lib/cache';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
// import { hasFeature } from '@/services/user-tier'; // TODO: 队列功能暂时不启用
import { RateLimiter, PREVIEW_LIMITS } from '@/lib/rate-limiter';
import { enqueueJob, waitForTurn, markDone } from '@/services/queue';
import { POLICY } from '@/services/policy';
import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { AbuseDetector } from '@/lib/abuse-detector';
import { quotaTracker } from '@/services/quota-tracker';
import { headers } from 'next/headers';
import { YouTubeService } from '@/lib/youtube';
// import { PriorityQueueManager } from '@/lib/priority-queue'; // TODO: 队列功能暂时不启用

// 初始化服务 - 支持两个模型：Deepgram + OpenAI Whisper
const transcriptionService = new TranscriptionService(
  process.env.REPLICATE_API_TOKEN || '',
  process.env.DEEPGRAM_API_KEY
);
const rateLimiter = new RateLimiter();
const abuseDetector = new AbuseDetector();

// 如果有Deepgram API Key，使用优化的转录服务
const deepgramEnabled = !!process.env.DEEPGRAM_API_KEY;
console.log(`Deepgram ${deepgramEnabled ? 'enabled' : 'disabled'} - Using ${deepgramEnabled ? 'Deepgram + Whisper' : 'Whisper only'} strategy`);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content, options = {}, action = 'transcribe' } = body;
    const user_uuid = await getUserUuid();
    console.log('[API] /api/transcribe POST', {
      action,
      type,
      hasUser: !!user_uuid,
      userTierOpt: options?.userTier,
      highAccuracyOpt: options?.highAccuracyMode,
      previewAllowAnon: process.env.PREVIEW_ALLOW_ANON
    });
    
    // 获取请求信息用于防滥用
    const headersList = await headers();
    const clientIp = headersList.get('x-forwarded-for')?.split(',')[0] || 
                     headersList.get('x-real-ip') || 
                     'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';
    
    // 生成设备指纹
    const fingerprint = abuseDetector.generateFingerprint({
      userAgent,
      acceptLanguage: headersList.get('accept-language') || undefined,
      acceptEncoding: headersList.get('accept-encoding') || undefined
    });

    // 验证必需参数
    if (!type || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: type and content' },
        { status: 400 }
      );
    }

    // 验证类型
    if (!['youtube_url', 'file_upload', 'audio_url'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be youtube_url, file_upload, or audio_url' },
        { status: 400 }
      );
    }

    // 已移除独立的语言探针 action，前端不再调用

    // 根据动作类型处理请求
    if (action === 'preview') {
      console.log('[TEST][PREV-001] preview.start', { type, hasUser: !!user_uuid });
      // 预览请求的防滥用检查
      const identifier = user_uuid || `${clientIp}_${fingerprint}`;
      
      // 检查是否被阻止
      if (abuseDetector.isBlocked(identifier)) {
        return NextResponse.json(
          { success: false, error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }
      
      // 根据用户状态选择限制策略
      const suspicionScore = abuseDetector.getSuspicionScore(identifier);
      let limits;
      
      if (suspicionScore > 10) {
        limits = PREVIEW_LIMITS.SUSPICIOUS;
      } else if (user_uuid) {
        limits = PREVIEW_LIMITS.AUTHENTICATED; // 已登录用户
      } else {
        limits = PREVIEW_LIMITS.ANONYMOUS; // 未登录用户
      }
      const rateCheck = rateLimiter.checkLimit(
        identifier,
        limits.maxRequests,
        limits.windowMs,
        fingerprint,
        (limits as any).dailyMax
      );
      
      if (!rateCheck.allowed) {
        const errorMessage = user_uuid 
          ? 'Preview limit reached. Try again in an hour or upgrade your plan.'
          : 'Preview limit reached (1 per hour for guests). Sign in for more previews.';
        
        return NextResponse.json(
          { 
            success: false, 
            error: errorMessage,
            resetAt: new Date(rateCheck.resetAt).toISOString(),
            authRequired: !user_uuid
          },
          { status: 429 }
        );
      }
      
      // 检测滥用行为
      const abuseSignals = abuseDetector.detectAbuse(identifier, {
        ip: clientIp,
        userAgent,
        videoId: content,
        timestamp: Date.now()
      });
      
      if (abuseSignals.some(s => s.severity === 'high')) {
        console.warn(`High severity abuse detected for ${identifier}:`, abuseSignals);
      }
      
      // 生成预览，使用降级策略
      try {
        const _previewStart = Date.now();
        const result = await transcriptionService.generatePreview({
          type,
          content,
          options: { ...options, isPreview: true, fallbackEnabled: true }
        });
        console.log('[TEST][PREV-001] preview.ok', { duration: result?.preview?.duration, hasText: !!result?.preview?.text, hasSrt: !!result?.preview?.srt });
        console.log(`[API] preview ${type} done in ${Date.now()-_previewStart}ms (success=${result?.success})`);
        
        return NextResponse.json({
          ...result,
          rateLimit: {
            remaining: rateCheck.remaining,
            resetAt: new Date(rateCheck.resetAt).toISOString(),
            dailyRemaining: rateCheck.dailyRemaining,
            dailyResetAt: rateCheck.dailyResetAt ? new Date(rateCheck.dailyResetAt).toISOString() : undefined
          }
        });
      } catch (error) {
        console.error('[TEST][PREV-001] preview.failed', error);
        // 如果两个模型都失败，返回错误
        return NextResponse.json(
          { success: false, error: 'Preview generation temporarily unavailable' },
          { status: 503 }
        );
      }
    } else {
      // 未登录：只返回90秒预览，不执行完整转录且不存储
      if (!user_uuid) {
        console.log('[API] unauthenticated full request -> preview only');
        
        // 应用相同的速率限制
        const identifier = `${clientIp}_${fingerprint}`;
        const rateCheck = rateLimiter.checkLimit(
          identifier,
          PREVIEW_LIMITS.ANONYMOUS.maxRequests,
          PREVIEW_LIMITS.ANONYMOUS.windowMs,
          fingerprint,
          PREVIEW_LIMITS.ANONYMOUS.dailyMax
        );
        
        if (!rateCheck.allowed) {
          return NextResponse.json(
            { success: false, error: 'Please sign in to continue', authRequired: true },
            { status: 429 }
          );
        }
        
        const _previewStart = Date.now();
        const result = await transcriptionService.generatePreview({ 
          type, 
          content, 
          options: { ...options, isPreview: true, fallbackEnabled: true }
        });
        console.log('[TEST][PREV-001] preview.unauth.ok', { duration: result?.preview?.duration });
        console.log(`[API] preview unauth ${type} done in ${Date.now()-_previewStart}ms (success=${result?.success})`);
        
        return NextResponse.json({ 
          ...result, 
          authRequired: true,
          rateLimit: {
            remaining: rateCheck.remaining,
            resetAt: new Date(rateCheck.resetAt).toISOString()
          }
        });
      }

      // 获取用户等级
      const userTier = await getUserTier(user_uuid);
      
      // Free用户限制：检查视频时长（YouTube URL）
      if (userTier === UserTier.FREE && type === 'youtube_url') {
        try {
          const { YouTubeService } = await import('@/lib/youtube');
          const videoInfo = await YouTubeService.getVideoInfo(content);
          const maxSeconds = POLICY.preview.freePreviewSeconds || 300; // 5分钟
          
          console.log('[FREE_CLIP][API] Free user YouTube video check:', {
            userTier,
            videoId: content,
            videoDuration: videoInfo.duration,
            maxAllowed: maxSeconds,
            needsClipping: videoInfo.duration > maxSeconds
          });
          
          if (videoInfo.duration > maxSeconds) {
            // 只转录前5分钟
            options.trimToSeconds = maxSeconds;
            console.log('[FREE_CLIP][API] Setting trimToSeconds for Free user:', {
              originalDuration: videoInfo.duration,
              trimToSeconds: maxSeconds,
              savingsPercent: ((1 - maxSeconds/videoInfo.duration) * 100).toFixed(1)
            });
          }
        } catch (error) {
          console.error('[FREE_CLIP][API] Failed to check video duration:', error);
          // Continue if we can't get video info
        }
      }
      
      // Free用户限制：上传文件（用户文件）
      if (userTier === UserTier.FREE && type === 'file_upload') {
        // 对于文件上传，我们无法预先知道时长，但可以在转录后检查
        // 标记需要在转录后截断
        options.trimToSeconds = POLICY.preview.freePreviewSeconds || 300;
        console.log('[FREE_CLIP][API] Free user file upload - will clip to:', {
          userTier,
          type: 'file',
          trimToSeconds: options.trimToSeconds
        });
      }

      // Free用户限制：直链音频，也统一裁剪到预览时长
      if (userTier === UserTier.FREE && type === 'audio_url') {
        options.trimToSeconds = POLICY.preview.freePreviewSeconds || 300;
        console.log('[FREE_CLIP][API] Free user audio_url - will clip to:', {
          userTier,
          type: 'audio_url',
          trimToSeconds: options.trimToSeconds
        });
      }
      
      // Add job to priority queue if user has priority queue feature
      // TODO: 第一版暂时不启用队列功能，后续根据需求再开启
      let queueInfo = null;
      // if (hasFeature(userTier, 'priorityQueue')) {
      //   const jobId = PriorityQueueManager.addJob({
      //     userId: user_uuid,
      //     userTier,
      //     type: 'transcription',
      //     data: { type, content, options },
      //     status: 'pending'
      //   });
      //   
      //   queueInfo = {
      //     jobId,
      //     position: PriorityQueueManager.getQueuePosition(jobId),
      //     estimatedWait: PriorityQueueManager.getEstimatedWaitTime(userTier),
      //     priority: userTier
      //   };
      //   
      //   console.log(`[API] Job ${jobId} added to priority queue for ${userTier} user`);
      // }
      
      // 检查用户配额（先用分钟包抵扣估算，再核配额）
      let estimatedMinutes = 10; // 估算的转录时长，实际应根据音频长度计算
      try {
        const { getEstimatedPackCoverage } = await import('@/services/minutes');
        const cover = await getEstimatedPackCoverage(user_uuid, estimatedMinutes, (options?.highAccuracyMode && userTier === 'pro') ? 'high_accuracy' : 'standard');
        estimatedMinutes = Math.max(0, estimatedMinutes - cover);
      } catch {}
      const quotaStatus = await quotaTracker.checkQuota(
        user_uuid,
        userTier,
        estimatedMinutes,
        options?.highAccuracyMode && userTier === 'pro' ? 'high_accuracy' : 'standard'
      );
      
      if (!quotaStatus.isAllowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: (quotaStatus.reason || 'Quota exceeded') + ' — Upgrade at /pricing',
            upgrade: { url: '/pricing', reason: quotaStatus.reason || 'quota', required: 'upgrade' },
            quotaInfo: {
              tier: userTier,
              remaining: quotaStatus.remaining,
              usage: quotaStatus.usage
            }
          },
          { status: 429 }
        );
      }
      
      // 分布式 FIFO（可开关）：默认关闭，避免用户感知排队
      const queueEnabled = (process.env.Q_ENABLED === 'true');
      let jobId: string | undefined;
      if (queueEnabled) {
        const info = await enqueueJob(String(userTier).toLowerCase(), user_uuid);
        jobId = info.jobId;
        const turn = await waitForTurn(String(userTier).toLowerCase(), info.jobId, info.createdAt, Number(process.env.Q_TIMEOUT_MS || 120000));
        if (!turn.picked) {
          await markDone(info.jobId);
          return NextResponse.json({ success: false, error: 'Queue timeout, please try again later' }, { status: 503 });
        }
      }
      // 如果客户端支持SSE，使用流式响应
      if (options.streamProgress) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              // 发送初始进度
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                stage: 'download',
                percentage: 0,
                message: 'Starting download...'
              })}\n\n`));

              const _procStart = Date.now();
              
              // 处理转录，启用降级，传入进度回调
              let result = await transcriptionService.processTranscription({
                type,
                content,
                options: { 
                  ...options, 
                  userId: user_uuid, 
                  userTier,
                  fallbackEnabled: true,
                  onProgress: (progress: any) => {
                    // 发送进度更新
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'progress',
                      ...progress
                    })}\n\n`));
                  }
                }
              });
              if (!result?.success) {
                console.warn('[API] transcribe.retry.once (SSE path)');
                try {
                  result = await transcriptionService.processTranscription({ type, content, options: { ...options, userId: user_uuid, userTier, fallbackEnabled: true } });
                } catch {}
              }
              
              console.log('[API] transcribe.completed', { success: result?.success, fromCache: result?.data?.fromCache, duration: result?.data?.transcription?.duration, language: result?.data?.transcription?.language });
              console.log(`[API] transcribe ${type} done in ${Date.now()-_procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);
              
              // 记录使用情况（按真实转录时长）
              const durationSec = result?.data?.transcription?.duration || 0;
              if (result.success && durationSec > 0) {
                const actualMinutes = durationSec / 60;
                const usedHighAccuracy = !!options?.highAccuracyMode && userTier === 'pro';
                // 先扣分钟包，再把剩余分钟计入月配额
                try {
                  const { deductFromPacks } = await import('@/services/minutes');
                  const leftover = await deductFromPacks(user_uuid, actualMinutes, usedHighAccuracy ? 'high_accuracy' : 'standard');
                  const leftoverRounded = Math.max(0, Math.round(leftover * 100) / 100);
                  if (leftoverRounded > 0) {
                    await quotaTracker.recordUsage(user_uuid, leftoverRounded, usedHighAccuracy ? 'high_accuracy' : 'standard');
                  }
                } catch { await quotaTracker.recordUsage(user_uuid, Math.max(0.01, Math.round(actualMinutes * 100) / 100), usedHighAccuracy ? 'high_accuracy' : 'standard'); }
                // 高精度溢出计费（仅记录溢出分钟，统一对账扣费）
                if (usedHighAccuracy && process.env.OVERAGE_ENABLED !== 'false') {
                  try {
                    const now = new Date();
                    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
                    const [row] = await db().select({
                      total: sql<number>`COALESCE(SUM(${usage_records.minutes}),0)`
                    }).from(usage_records).where(and(eq(usage_records.user_id, user_uuid), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'high_accuracy')));
                    const total = Number(row?.total || 0);
                    const prev = Math.max(0, total - actualMinutes);
                    const quota = 200;
                    const overAfter = Math.max(0, total - quota);
                    const overPrev = Math.max(0, prev - quota);
                    const overThis = Math.max(0, overAfter - overPrev);
                    if (overThis > 0) {
                      await db().insert(usage_records).values({ user_id: user_uuid, date: new Date().toISOString().slice(0,10), minutes: String(Math.ceil(overThis)), model_type: 'overage_high_accuracy', created_at: new Date() });
                      if (process.env.OVERAGE_STRIPE_ENABLED === 'true') {
                        const { createOverageInvoiceItem } = await import('@/services/overage');
                        await createOverageInvoiceItem(user_uuid, overThis, Number(process.env.OVERAGE_CENTS_PER_MINUTE || 5));
                      }
                    }
                  } catch {}
                }
              }
              
              // 发送100%完成进度
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                stage: 'process',
                percentage: 100,
                message: 'Completed',
                estimatedTime: '0s'
              })}\n\n`));
              
              // 发送最终结果
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                result: {
                  ...result,
                  quotaInfo: {
                    tier: userTier,
                    remaining: quotaStatus.remaining
                  }
                }
              })}\n\n`));
              
              controller.close();
            } catch (error) {
              console.error('Stream error:', error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Processing failed'
              })}\n\n`));
              controller.close();
            } finally {
              try { await markDone(jobId); } catch {}
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      // 非流式响应（向后兼容）
      try {
      const _procStart = Date.now();
      let result = await transcriptionService.processTranscription({
        type,
        content,
        options: { 
          ...options, 
          userId: user_uuid, 
          userTier,
          fallbackEnabled: true  // 为付费用户也启用降级保证服务可用性
        }
      });
      if (!result?.success) {
        console.warn('[API] transcribe.retry.once');
        try { result = await transcriptionService.processTranscription({ type, content, options: { ...options, userId: user_uuid, userTier, fallbackEnabled: true } }); } catch {}
      }
      console.log('[API] transcribe.completed', { success: result?.success, fromCache: result?.data?.fromCache, duration: result?.data?.transcription?.duration, language: result?.data?.transcription?.language });
      console.log(`[API] transcribe ${type} done in ${Date.now()-_procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);
      
      // 记录使用情况（按真实转录时长）
      const durationSec = result?.data?.transcription?.duration || 0;
      if (result.success && durationSec > 0) {
        const actualMinutes = durationSec / 60;
        const usedHighAccuracy = !!options?.highAccuracyMode && userTier === 'pro';
        try {
          const { deductFromPacks } = await import('@/services/minutes');
          const leftover = await deductFromPacks(user_uuid, actualMinutes, usedHighAccuracy ? 'high_accuracy' : 'standard');
          const leftoverRounded = Math.max(0, Math.round(leftover * 100) / 100);
          if (leftoverRounded > 0) {
            await quotaTracker.recordUsage(user_uuid, leftoverRounded, usedHighAccuracy ? 'high_accuracy' : 'standard');
          }
        } catch { await quotaTracker.recordUsage(user_uuid, Math.max(0.01, Math.round(actualMinutes * 100) / 100), usedHighAccuracy ? 'high_accuracy' : 'standard'); }
        if (usedHighAccuracy && process.env.OVERAGE_ENABLED !== 'false') {
          try {
            const now = new Date();
            const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            const [row] = await db().select({ total: sql<number>`COALESCE(SUM(${usage_records.minutes}),0)` })
              .from(usage_records)
              .where(and(eq(usage_records.user_id, user_uuid), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'high_accuracy')));
            const total = Number(row?.total || 0);
            const prev = Math.max(0, total - actualMinutes);
            const quota = 200;
            const overAfter = Math.max(0, total - quota);
            const overPrev = Math.max(0, prev - quota);
            const overThis = Math.max(0, overAfter - overPrev);
            if (overThis > 0) {
              await db().insert(usage_records).values({ user_id: user_uuid, date: new Date().toISOString().slice(0,10), minutes: String(Math.ceil(overThis)), model_type: 'overage_high_accuracy', created_at: new Date() });
              if (process.env.OVERAGE_STRIPE_ENABLED === 'true') {
                const { createOverageInvoiceItem } = await import('@/services/overage');
                await createOverageInvoiceItem(user_uuid, overThis, Number(process.env.OVERAGE_CENTS_PER_MINUTE || 5));
              }
            }
          } catch {}
        }
      }
      
      return NextResponse.json({
        ...result,
        quotaInfo: {
          tier: userTier,
          remaining: quotaStatus.remaining
        }
        // ...(queueInfo && { queueInfo })  // TODO: 队列功能暂时不启用
      });
    } finally {
      // 非流式路径兜底置 done（SSE 已在内部处理）
      if (queueEnabled && jobId) {
        try { await markDone(jobId); } catch {}
      }
    }
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// 获取缓存状态和统计信息
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'stats') {
      const stats = transcriptionCache.getStats();
      const metrics = transcriptionCache.getCacheMetrics();
      
      return NextResponse.json({
        success: true,
        data: {
          cache: stats,
          metrics
        }
      });
    }

    if (action === 'check') {
      const type = url.searchParams.get('type') as 'youtube' | 'user_file';
      const identifier = url.searchParams.get('identifier');
      const userId = url.searchParams.get('userId') || undefined;

      if (!type || !identifier) {
        return NextResponse.json(
          { success: false, error: 'Missing type or identifier' },
          { status: 400 }
        );
      }

      const exists = await transcriptionCache.exists(type, identifier, userId);
      
      return NextResponse.json({
        success: true,
        data: { exists }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
 
