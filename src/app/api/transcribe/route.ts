import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@/lib/transcription';
import { transcriptionCache } from '@/lib/cache';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
import { getUserSubscriptionPlan, SubscriptionPlan } from '@/services/user-subscription';
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
import { computeEstimatedMinutes } from '@/lib/estimate-usage';
// import { PriorityQueueManager } from '@/lib/priority-queue'; // TODO: 队列功能暂时不启用

// 初始化服务 - 支持两个模型：Deepgram + OpenAI Whisper
const transcriptionService = new TranscriptionService(
  process.env.REPLICATE_API_TOKEN || '',
  process.env.DEEPGRAM_API_KEY
);
const rateLimiter = new RateLimiter();
const abuseDetector = new AbuseDetector();

type TranscriptionSourceType = 'youtube_url' | 'file_upload' | 'audio_url';

// 如果有Deepgram API Key，使用优化的转录服务
const deepgramEnabled = !!process.env.DEEPGRAM_API_KEY;
console.log(`Deepgram ${deepgramEnabled ? 'enabled' : 'disabled'} - Using ${deepgramEnabled ? 'Deepgram + Whisper' : 'Whisper only'} strategy`);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content, options = {}, action = 'transcribe' } = body;
    const userUuid = await getUserUuid();
    console.log('[API] /api/transcribe POST', {
      action,
      type,
      hasUser: !!userUuid,
      userTierOpt: options?.userTier,
      highAccuracyOpt: options?.highAccuracyMode,
      previewAllowAnon: process.env.PREVIEW_ALLOW_ANON
    });

    const headersList = await headers();
    const clientIp = headersList.get('x-forwarded-for')?.split(',')[0] ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const fingerprint = abuseDetector.generateFingerprint({
      userAgent,
      acceptLanguage: headersList.get('accept-language') || undefined,
      acceptEncoding: headersList.get('accept-encoding') || undefined
    });

    if (!type || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: type and content' },
        { status: 400 }
      );
    }

    if (!['youtube_url', 'file_upload', 'audio_url'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be youtube_url, file_upload, or audio_url' },
        { status: 400 }
      );
    }

    const sourceType = type as TranscriptionSourceType;

    if (action === 'preview') {
      return handlePreviewRequest({
        type: sourceType,
        content,
        options,
        userUuid,
        clientIp,
        fingerprint,
        userAgent
      });
    }

    if (!userUuid) {
      return handleAnonymousRequest({
        type: sourceType,
        content,
        options,
        clientIp,
        fingerprint
      });
    }

    return handleAuthenticatedRequest({
      type: sourceType,
      content,
      options,
      userUuid
    });
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

type PreviewRequestParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  userUuid: string | null;
  clientIp: string;
  fingerprint: string;
  userAgent: string;
};

async function handlePreviewRequest(params: PreviewRequestParams) {
  const { type, content, options, userUuid, clientIp, fingerprint, userAgent } = params;
  console.log('[TEST][PREV-001] preview.start', { type, hasUser: !!userUuid });

  const identifier = userUuid || `${clientIp}_${fingerprint}`;

  if (abuseDetector.isBlocked(identifier)) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  const suspicionScore = abuseDetector.getSuspicionScore(identifier);
  let limits;
  if (suspicionScore > 10) {
    limits = PREVIEW_LIMITS.SUSPICIOUS;
  } else if (userUuid) {
    limits = PREVIEW_LIMITS.AUTHENTICATED;
  } else {
    limits = PREVIEW_LIMITS.ANONYMOUS;
  }

  const rateCheck = rateLimiter.checkLimit(
    identifier,
    limits.maxRequests,
    limits.windowMs,
    fingerprint,
    (limits as any).dailyMax
  );

  if (!rateCheck.allowed) {
    const errorMessage = userUuid
      ? 'Preview limit reached. Try again in an hour or upgrade your plan.'
      : 'Preview limit reached (1 per hour for guests). Sign in for more previews.';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        resetAt: new Date(rateCheck.resetAt).toISOString(),
        authRequired: !userUuid
      },
      { status: 429 }
    );
  }

  const abuseSignals = abuseDetector.detectAbuse(identifier, {
    ip: clientIp,
    userAgent,
    videoId: content,
    timestamp: Date.now()
  });

  if (abuseSignals.some(signal => signal.severity === 'high')) {
    console.warn(`High severity abuse detected for ${identifier}:`, abuseSignals);
  }

  try {
    const previewStart = Date.now();
    const result = await transcriptionService.generatePreview({
      type,
      content,
      options: { ...options, isPreview: true, fallbackEnabled: true }
    });
    console.log('[TEST][PREV-001] preview.ok', {
      duration: result?.preview?.duration,
      hasText: !!result?.preview?.text,
      hasSrt: !!result?.preview?.srt
    });
    console.log(`[API] preview ${type} done in ${Date.now() - previewStart}ms (success=${result?.success})`);

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
    return NextResponse.json(
      { success: false, error: 'Preview generation temporarily unavailable' },
      { status: 503 }
    );
  }
}

type AnonymousRequestParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  clientIp: string;
  fingerprint: string;
};

async function handleAnonymousRequest(params: AnonymousRequestParams) {
  const { type, content, options, clientIp, fingerprint } = params;
  console.log('[API] unauthenticated full request -> preview only');

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

  const previewStart = Date.now();
  const result = await transcriptionService.generatePreview({
    type,
    content,
    options: { ...options, isPreview: true, fallbackEnabled: true }
  });

  console.log('[TEST][PREV-001] preview.unauth.ok', { duration: result?.preview?.duration });
  console.log(`[API] preview unauth ${type} done in ${Date.now() - previewStart}ms (success=${result?.success})`);

  return NextResponse.json({
    ...result,
    authRequired: true,
    rateLimit: {
      remaining: rateCheck.remaining,
      resetAt: new Date(rateCheck.resetAt).toISOString()
    }
  });
}

type AuthenticatedRequestParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  userUuid: string;
};

async function handleAuthenticatedRequest(params: AuthenticatedRequestParams) {
  const { type, content, options, userUuid } = params;

  const normalizedOptions: Record<string, any> = { ...options };
  if (normalizedOptions.highAccuracyMode === undefined) {
    const alias = normalizedOptions.high_accuracy ?? normalizedOptions.highAccuracy;
    if (alias !== undefined) {
      normalizedOptions.highAccuracyMode = !!alias;
    }
  }
  const userTier = await getUserTier(userUuid);
  const subscriptionPlan = await getUserSubscriptionPlan(userUuid);
  const { hasHighAccuracyAccess } = await import('@/services/user-tier');
  const canUseHighAccuracy = await hasHighAccuracyAccess(userUuid);
  await applyFreeTierConstraints({
    type,
    content,
    options: normalizedOptions,
    userTier,
    userUuid
  });

  const queueState = await acquireQueueSlot(userTier, userUuid);
  if (queueState.response) {
    return queueState.response;
  }

  const estimatedMinutes = await computeEstimatedMinutes({
    type,
    content,
    userTier,
    options: normalizedOptions,
    userUuid,
    modelType: normalizedOptions?.highAccuracyMode && canUseHighAccuracy ? 'high_accuracy' : 'standard'
  });

  const quotaStatus = await quotaTracker.checkQuota(
    userUuid,
    userTier,
    estimatedMinutes,
    normalizedOptions?.highAccuracyMode && canUseHighAccuracy ? 'high_accuracy' : 'standard'
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

  if (normalizedOptions.streamProgress) {
    return runStreamingTranscription({
      type,
      content,
      options: normalizedOptions,
      userUuid,
      userTier,
      subscriptionPlan,
      canUseHighAccuracy,
      quotaStatus,
      jobId: queueState.jobId,
      queueEnabled: queueState.queueEnabled
    });
  }

  return runStandardTranscription({
    type,
    content,
    options: normalizedOptions,
    userUuid,
    userTier,
    subscriptionPlan,
    canUseHighAccuracy,
    quotaStatus,
    jobId: queueState.jobId,
    queueEnabled: queueState.queueEnabled
  });
}

type FreeTierConstraintParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  userTier: UserTier;
  userUuid: string;
};

async function applyFreeTierConstraints(params: FreeTierConstraintParams) {
  const { type, content, options, userTier, userUuid } = params;

  if (userTier !== UserTier.FREE) {
    return;
  }

  const isProcessedUrl = content.includes('.r2.dev/') || content.includes('pub-') || content.includes('/api/media/proxy');

  if (type === 'youtube_url' && !isProcessedUrl) {
    try {
      const videoInfo = await YouTubeService.getVideoInfo(content);
      if (videoInfo?.duration && Number.isFinite(videoInfo.duration)) {
        options.estimatedDurationSec = videoInfo.duration;
      }
      let maxSeconds = POLICY.preview.freePreviewSeconds || 300;
      try {
        const { getMinuteBalances } = await import('@/services/minutes');
        const balances = await getMinuteBalances(userUuid);
        const packAllowance = Math.max(0, Number(balances.stdTotal || balances.std || 0)) * 60;
        if (packAllowance > 0) maxSeconds += packAllowance;
      } catch {}

      console.log('[FREE_CLIP][API] Free user YouTube video check:', {
        userTier,
        videoId: content,
        videoDuration: videoInfo.duration,
        maxAllowed: maxSeconds,
        needsClipping: videoInfo.duration > maxSeconds
      });

      if (videoInfo.duration > maxSeconds) {
        options.trimToSeconds = maxSeconds;
        console.log('[FREE_CLIP][API] Setting trimToSeconds for Free user:', {
          originalDuration: videoInfo.duration,
          trimToSeconds: maxSeconds,
          savingsPercent: ((1 - maxSeconds / videoInfo.duration) * 100).toFixed(1)
        });
      }
    } catch (error) {
      console.error('[FREE_CLIP][API] Failed to check video duration:', error);
    }
  }

  if (type === 'youtube_url' && isProcessedUrl) {
    let maxSeconds = POLICY.preview.freePreviewSeconds || 300;
    try {
      const { getMinuteBalances } = await import('@/services/minutes');
      const balances = await getMinuteBalances(userUuid);
      const packAllowance = Math.max(0, Number(balances.stdTotal || balances.std || 0)) * 60;
      if (packAllowance > 0) maxSeconds += packAllowance;
    } catch {}
    options.trimToSeconds = maxSeconds;
    if (!options.estimatedDurationSec && Number.isFinite(maxSeconds)) {
      options.estimatedDurationSec = maxSeconds;
    }
    console.log('[FREE_CLIP][API] Free user with processed URL - applying 5min limit:', {
      userTier,
      isProcessedUrl: true,
      trimToSeconds: options.trimToSeconds
    });
  }

  if (type === 'file_upload') {
    let maxSeconds = POLICY.preview.freePreviewSeconds || 300;
    try {
      const { getMinuteBalances } = await import('@/services/minutes');
      const balances = await getMinuteBalances(userUuid);
      const packAllowance = Math.max(0, Number(balances.stdTotal || balances.std || 0)) * 60;
      if (packAllowance > 0) maxSeconds += packAllowance;
    } catch {}
    options.trimToSeconds = maxSeconds;
    if (!options.estimatedDurationSec && Number.isFinite(maxSeconds)) {
      options.estimatedDurationSec = maxSeconds;
    }
    console.log('[FREE_CLIP][API] Free user file upload - will clip to:', {
      userTier,
      type: 'file',
      trimToSeconds: options.trimToSeconds
    });
  }

  if (type === 'audio_url') {
    let maxSeconds = POLICY.preview.freePreviewSeconds || 300;
    try {
      const { getMinuteBalances } = await import('@/services/minutes');
      const balances = await getMinuteBalances(userUuid);
      const packAllowance = Math.max(0, Number(balances.stdTotal || balances.std || 0)) * 60;
      if (packAllowance > 0) maxSeconds += packAllowance;
    } catch {}
    options.trimToSeconds = maxSeconds;
    if (!options.estimatedDurationSec && Number.isFinite(maxSeconds)) {
      options.estimatedDurationSec = maxSeconds;
    }
    console.log('[FREE_CLIP][API] Free user audio_url - will clip to:', {
      userTier,
      type: 'audio_url',
      trimToSeconds: options.trimToSeconds
    });
  }
}

type QueueState = {
  queueEnabled: boolean;
  jobId?: string;
  response?: NextResponse;
};

async function acquireQueueSlot(userTier: UserTier, userUuid: string): Promise<QueueState> {
  const queueEnabled = process.env.Q_ENABLED === 'true';
  if (!queueEnabled) {
    return { queueEnabled: false };
  }

  const info = await enqueueJob(String(userTier).toLowerCase(), userUuid);
  const turn = await waitForTurn(String(userTier).toLowerCase(), info.jobId, info.createdAt, Number(process.env.Q_TIMEOUT_MS || 120000));
  if (!turn.picked) {
    await markDone(info.jobId);
    return {
      queueEnabled: true,
      response: NextResponse.json({ success: false, error: 'Queue timeout, please try again later' }, { status: 503 })
    };
  }

  return { queueEnabled: true, jobId: info.jobId };
}

type StreamingParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  userUuid: string;
  userTier: UserTier;
  subscriptionPlan: SubscriptionPlan;
  canUseHighAccuracy: boolean;
  quotaStatus: Awaited<ReturnType<typeof quotaTracker.checkQuota>>;
  jobId?: string;
  queueEnabled: boolean;
};

async function runStreamingTranscription(params: StreamingParams) {
  const { type, content, options, userUuid, userTier, subscriptionPlan, canUseHighAccuracy, quotaStatus, jobId, queueEnabled } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'progress',
          stage: 'download',
          percentage: 0,
          message: 'Starting download...'
        })}\n\n`));

        const procStart = Date.now();
        let result = await transcriptionService.processTranscription({
          type,
          content,
          options: {
            ...options,
            userId: userUuid,
            userTier,
            fallbackEnabled: true,
            onProgress: (progress: any) => {
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
            result = await transcriptionService.processTranscription({
              type,
              content,
              options: { ...options, userId: userUuid, userTier, fallbackEnabled: true }
            });
          } catch {}
        }

        console.log('[API] transcribe.completed', {
          success: result?.success,
          fromCache: result?.data?.fromCache,
          duration: result?.data?.transcription?.duration,
          language: result?.data?.transcription?.language
        });
        console.log(`[API] transcribe ${type} done in ${Date.now() - procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);

        const durationSec = result?.data?.transcription?.duration || 0;
        if (result.success && durationSec > 0) {
          await recordUsageForTranscription({
            userUuid,
            userTier,
            subscriptionPlan,
            durationSec,
            options,
            canUseHighAccuracy
          });
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'progress',
          stage: 'process',
          percentage: 100,
          message: 'Completed',
          estimatedTime: '0s'
        })}\n\n`));

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
        if (queueEnabled && jobId) {
          try {
            await markDone(jobId);
          } catch {}
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

type StandardParams = {
  type: TranscriptionSourceType;
  content: string;
  options: Record<string, any>;
  userUuid: string;
  userTier: UserTier;
  subscriptionPlan: SubscriptionPlan;
  canUseHighAccuracy: boolean;
  quotaStatus: Awaited<ReturnType<typeof quotaTracker.checkQuota>>;
  jobId?: string;
  queueEnabled: boolean;
};

async function runStandardTranscription(params: StandardParams) {
  const { type, content, options, userUuid, userTier, subscriptionPlan, canUseHighAccuracy, quotaStatus, jobId, queueEnabled } = params;

  try {
    const procStart = Date.now();
    let result = await transcriptionService.processTranscription({
      type,
      content,
      options: {
        ...options,
        userId: userUuid,
        userTier,
        fallbackEnabled: true
      }
    });

    if (!result?.success) {
      console.warn('[API] transcribe.retry.once');
      try {
        result = await transcriptionService.processTranscription({
          type,
          content,
          options: { ...options, userId: userUuid, userTier, fallbackEnabled: true }
        });
      } catch {}
    }

    console.log('[API] transcribe.completed', {
      success: result?.success,
      fromCache: result?.data?.fromCache,
      duration: result?.data?.transcription?.duration,
      language: result?.data?.transcription?.language
    });
    console.log(`[API] transcribe ${type} done in ${Date.now() - procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);

    const durationSec = result?.data?.transcription?.duration || 0;
    if (result.success && durationSec > 0) {
      await recordUsageForTranscription({
        userUuid,
        userTier,
        subscriptionPlan,
        durationSec,
        options,
        canUseHighAccuracy
      });
    }

    return NextResponse.json({
      ...result,
      quotaInfo: {
        tier: userTier,
        remaining: quotaStatus.remaining
      }
    });
  } finally {
    if (queueEnabled && jobId) {
      try {
        await markDone(jobId);
      } catch {}
    }
  }
}

type UsageParams = {
  userUuid: string;
  userTier: UserTier;
  subscriptionPlan: SubscriptionPlan;
  durationSec: number;
  options: Record<string, any>;
  canUseHighAccuracy: boolean;
};

async function recordUsageForTranscription(params: UsageParams) {
  const { userUuid, userTier, subscriptionPlan, durationSec, options, canUseHighAccuracy } = params;
  if (!durationSec || durationSec <= 0) {
    return;
  }

  const actualMinutes = durationSec / 60;
  const usedHighAccuracy = !!options?.highAccuracyMode && canUseHighAccuracy;

  try {
    if (subscriptionPlan === 'FREE') {
      const { deductFromPacks } = await import('@/services/minutes');
      const remain = await deductFromPacks(userUuid, actualMinutes, 'standard');
      const safeRemain = Math.max(0, remain);
      const packUsed = Math.max(0, actualMinutes - safeRemain);
      const packRounded = Math.max(0, Math.round(packUsed * 100) / 100);
      console.log('[API] recordUsage', { user_uuid: userUuid, remain, packUsed });
      if (packRounded > 0) {
        await quotaTracker.recordUsage(
          userUuid,
          packRounded,
          usedHighAccuracy ? 'pack_high_accuracy' : 'pack_standard',
          'minute_pack'
        );
      }
      const leftoverRounded = Math.max(0, Math.round(safeRemain * 100) / 100);
      if (leftoverRounded > 0) {
        await quotaTracker.recordUsage(
          userUuid,
          leftoverRounded,
          'standard',
          'subscription'
        );
      }
    } else {
      const quota = await quotaTracker.checkQuota(
        userUuid,
        userTier,
        0,
        usedHighAccuracy ? 'high_accuracy' : 'standard'
      );
      const remainMonthly = Math.max(0, Number(quota.remaining.monthlyMinutes || 0));
      const remainHA = usedHighAccuracy ? Math.max(0, Number(quota.remaining.monthlyHighAccuracyMinutes || 0)) : Infinity;
      const subUse = Math.max(0, Math.min(actualMinutes, remainMonthly, remainHA));
      const subRounded = Math.max(0, Math.round(subUse * 100) / 100);
      if (subRounded > 0) {
        await quotaTracker.recordUsage(
          userUuid,
          subRounded,
          usedHighAccuracy ? 'high_accuracy' : 'standard',
          'subscription'
        );
      }
      const packNeed = Math.max(0, actualMinutes - subUse);
      if (packNeed > 0) {
        const { deductFromPacks } = await import('@/services/minutes');
        const packRemain = await deductFromPacks(userUuid, packNeed, 'standard');
        const safePackRemain = Math.max(0, packRemain);
        const packUsed = Math.max(0, packNeed - safePackRemain);
        const packRounded = Math.max(0, Math.round(packUsed * 100) / 100);
        if (packRounded > 0) {
          await quotaTracker.recordUsage(
            userUuid,
            packRounded,
            usedHighAccuracy ? 'pack_high_accuracy' : 'pack_standard',
            'minute_pack'
          );
        }
        const overflowRounded = Math.max(0, Math.round(safePackRemain * 100) / 100);
        if (overflowRounded > 0) {
          await quotaTracker.recordUsage(
            userUuid,
            overflowRounded,
            usedHighAccuracy ? 'high_accuracy' : 'standard',
            'subscription'
          );
        }
      }
    }
  } catch (err) {
    await quotaTracker.recordUsage(
      userUuid,
      Math.max(0.01, Math.round(actualMinutes * 100) / 100),
      usedHighAccuracy ? 'high_accuracy' : 'standard',
      'subscription'
    ).catch(() => {});
  }

  if (usedHighAccuracy && process.env.OVERAGE_ENABLED !== 'false') {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [row] = await db().select({
        total: sql<number>`COALESCE(SUM(${usage_records.minutes}),0)`
      }).from(usage_records).where(and(eq(usage_records.user_id, userUuid), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'high_accuracy')));

      const total = Number(row?.total || 0);
      const prev = Math.max(0, total - actualMinutes);
      const quota = 200;
      const overAfter = Math.max(0, total - quota);
      const overPrev = Math.max(0, prev - quota);
      const overThis = Math.max(0, overAfter - overPrev);

      if (overThis > 0) {
        await db().insert(usage_records).values({
          user_id: userUuid,
          date: new Date().toISOString().slice(0, 10),
          minutes: String(Math.ceil(overThis)),
          model_type: 'overage_high_accuracy',
          created_at: new Date()
        });
        if (process.env.OVERAGE_STRIPE_ENABLED === 'true') {
          const { createOverageInvoiceItem } = await import('@/services/overage');
          await createOverageInvoiceItem(userUuid, overThis, Number(process.env.OVERAGE_CENTS_PER_MINUTE || 5));
        }
      }
    } catch {}
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
 
