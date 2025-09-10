import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@/lib/transcription';
import { transcriptionCache } from '@/lib/cache';
import { getUserUuid } from '@/services/user';
import { getUserTier } from '@/services/user-tier';
// import { hasFeature } from '@/services/user-tier'; // TODO: 队列功能暂时不启用
import { RateLimiter, PREVIEW_LIMITS } from '@/lib/rate-limiter';
import { AbuseDetector } from '@/lib/abuse-detector';
import { quotaTracker } from '@/services/quota-tracker';
import { headers } from 'next/headers';
import { CloudflareR2Service } from '@/lib/r2-upload';
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

    // 语言探针：前端可在转录前调用
    if (action === 'probe') {
      console.log('[API/probe] type=%s', type);
      if (type === 'youtube_url') {
        try {
          const videoId = YouTubeService.validateAndParseUrl(content);
          if (!videoId) {
            return NextResponse.json({ success: true, language: 'unknown', isChinese: false, supported: false });
          }
          const videoInfo = await YouTubeService.getVideoInfo(videoId);
          const hasZhCaption = !!videoInfo.captions?.some(c => (c.languageCode || '').toLowerCase().includes('zh'));
          if (hasZhCaption) {
            console.log('[API/probe] youtube zh caption detected');
            return NextResponse.json({ success: true, supported: true, language: 'zh', isChinese: true });
          }
          // 无字幕：下载一个短音频片段，上传到 R2，调用 Deepgram 探针（不再使用标题启发式判定语言）
          try {
            const clip = await YouTubeService.downloadAudioClip(videoId, Math.max(8, Math.min(12, options.languageProbeSeconds || 10)));
            const r2 = new CloudflareR2Service();
            const uploaded = await r2.uploadFile(clip, `yt_probe_${videoId}.m4a`, 'audio/mp4', { folder: 'youtube-probe', expiresIn: 1, makePublic: true });
            const probeRes = await transcriptionService.probeLanguageFromUrl(uploaded.url, { userTier: options.userTier, languageProbeSeconds: Math.max(8, Math.min(12, options.languageProbeSeconds || 10)) });
            // 异步清理
            setTimeout(() => r2.deleteFile(uploaded.key).catch(() => {}), 30000);
            console.log('[API/probe] youtube clip deepgram result:', probeRes);
            return NextResponse.json({ success: true, supported: true, ...probeRes });
          } catch (probeError) {
            console.warn('YouTube short clip probe failed:', probeError);
            return NextResponse.json({ success: true, supported: true, language: 'unknown', isChinese: false });
          }
        } catch (e) {
          console.warn('YouTube probe failed:', e);
          return NextResponse.json({ success: true, language: 'unknown', isChinese: false, supported: false });
        }
      } else if (['audio_url', 'file_upload'].includes(type)) {
        const audioUrl = content;
        const res = await transcriptionService.probeLanguageFromUrl(audioUrl, { userTier: options.userTier, languageProbeSeconds: options.languageProbeSeconds });
        console.log('[API/probe] audio/file deepgram result:', res);
        return NextResponse.json({ success: true, supported: true, ...res });
      }
      return NextResponse.json({ success: true, language: 'unknown', isChinese: false, supported: false });
    }

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
      
      // 检查用户配额
      const estimatedMinutes = 10; // 估算的转录时长，实际应根据音频长度计算
      const quotaStatus = await quotaTracker.checkQuota(user_uuid, userTier, estimatedMinutes);
      
      if (!quotaStatus.isAllowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: quotaStatus.reason || 'Quota exceeded',
            quotaInfo: {
              tier: userTier,
              remaining: quotaStatus.remaining,
              usage: quotaStatus.usage
            }
          },
          { status: 429 }
        );
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
              const result = await transcriptionService.processTranscription({
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
              
              console.log('[API] transcribe.completed', { success: result?.success, fromCache: result?.data?.fromCache, duration: result?.data?.transcription?.duration, language: result?.data?.transcription?.language });
              console.log(`[API] transcribe ${type} done in ${Date.now()-_procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);
              
              // 记录使用情况（按真实转录时长）
              const durationSec = result?.data?.transcription?.duration || 0;
              if (result.success && durationSec > 0) {
                const actualMinutes = durationSec / 60;
                await quotaTracker.recordUsage(user_uuid, actualMinutes, userTier);
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
      const _procStart = Date.now();
      const result = await transcriptionService.processTranscription({
        type,
        content,
        options: { 
          ...options, 
          userId: user_uuid, 
          userTier,
          fallbackEnabled: true  // 为付费用户也启用降级保证服务可用性
        }
      });
      console.log('[API] transcribe.completed', { success: result?.success, fromCache: result?.data?.fromCache, duration: result?.data?.transcription?.duration, language: result?.data?.transcription?.language });
      console.log(`[API] transcribe ${type} done in ${Date.now()-_procStart}ms (success=${result?.success}, fromCache=${result?.data?.fromCache ?? false})`);
      
      // 记录使用情况（按真实转录时长）
      const durationSec = result?.data?.transcription?.duration || 0;
      if (result.success && durationSec > 0) {
        const actualMinutes = durationSec / 60;
        await quotaTracker.recordUsage(user_uuid, actualMinutes, userTier);
      }
      
      return NextResponse.json({
        ...result,
        quotaInfo: {
          tier: userTier,
          remaining: quotaStatus.remaining
        }
        // ...(queueInfo && { queueInfo })  // TODO: 队列功能暂时不启用
      });
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
