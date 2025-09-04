import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@/lib/transcription';
import { transcriptionCache } from '@/lib/cache';
import { getUserUuid } from '@/services/user';
import { getUserTier } from '@/services/user-tier';
import { RateLimiter, PREVIEW_LIMITS } from '@/lib/rate-limiter';
import { AbuseDetector } from '@/lib/abuse-detector';
import { quotaTracker } from '@/services/quota-tracker';
import { headers } from 'next/headers';

// 初始化服务
const transcriptionService = new TranscriptionService(
  process.env.REPLICATE_API_TOKEN || ''
);
const rateLimiter = new RateLimiter();
const abuseDetector = new AbuseDetector();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content, options = {}, action = 'transcribe' } = body;
    const user_uuid = await getUserUuid();
    
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

    // 根据动作类型处理请求
    if (action === 'preview') {
      // 预览请求的防滥用检查
      const identifier = user_uuid || `${clientIp}_${fingerprint}`;
      
      // 检查是否被阻止
      if (abuseDetector.isBlocked(identifier)) {
        return NextResponse.json(
          { success: false, error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }
      
      // 速率限制检查
      const suspicionScore = abuseDetector.getSuspicionScore(identifier);
      const limits = suspicionScore > 10 ? PREVIEW_LIMITS.SUSPICIOUS : PREVIEW_LIMITS.ANONYMOUS;
      const rateCheck = rateLimiter.checkLimit(
        identifier,
        limits.maxRequests,
        limits.windowMs,
        fingerprint
      );
      
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Preview limit exceeded. Please sign in for full access.',
            resetAt: new Date(rateCheck.resetAt).toISOString()
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
      
      console.log(`Generating preview for ${type}: ${content} (Rate limit: ${rateCheck.remaining} remaining)`);
      
      // 生成预览，使用降级策略
      try {
        const result = await transcriptionService.generatePreview({
          type,
          content,
          options: { ...options, isPreview: true, fallbackEnabled: true }
        });
        
        return NextResponse.json({
          ...result,
          rateLimit: {
            remaining: rateCheck.remaining,
            resetAt: new Date(rateCheck.resetAt).toISOString()
          }
        });
      } catch (error) {
        console.error('Preview generation failed with fallback:', error);
        // 如果两个模型都失败，返回错误
        return NextResponse.json(
          { success: false, error: 'Preview generation temporarily unavailable' },
          { status: 503 }
        );
      }
    } else {
      // 未登录：只返回90秒预览，不执行完整转录且不存储
      if (!user_uuid) {
        console.log(`Unauthenticated full transcription request; returning preview only.`);
        
        // 应用相同的速率限制
        const identifier = `${clientIp}_${fingerprint}`;
        const rateCheck = rateLimiter.checkLimit(
          identifier,
          PREVIEW_LIMITS.ANONYMOUS.maxRequests,
          PREVIEW_LIMITS.ANONYMOUS.windowMs,
          fingerprint
        );
        
        if (!rateCheck.allowed) {
          return NextResponse.json(
            { success: false, error: 'Please sign in to continue', authRequired: true },
            { status: 429 }
          );
        }
        
        const result = await transcriptionService.generatePreview({ 
          type, 
          content, 
          options: { ...options, isPreview: true, fallbackEnabled: true }
        });
        
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
      
      console.log(`Processing transcription for ${type}: ${content} (User tier: ${userTier})`);
      console.log(`Quota status: ${quotaStatus.remaining.monthlyMinutes} minutes remaining`);
      
      // 处理转录，启用降级
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
      
      // 记录使用情况
      if (result.success && result.duration) {
        const actualMinutes = result.duration / 60;
        await quotaTracker.recordUsage(user_uuid, actualMinutes, userTier);
      }
      
      return NextResponse.json({
        ...result,
        quotaInfo: {
          tier: userTier,
          remaining: quotaStatus.remaining
        }
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
