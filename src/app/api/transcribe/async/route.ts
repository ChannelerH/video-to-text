import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
import { db } from '@/db';
import { q_jobs, transcriptions, usage_records } from '@/db/schema';
import { getUniSeq } from '@/lib/hash';
import crypto from 'crypto';
import { and, gte, eq, count } from 'drizzle-orm';

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
    
    // Get user tier for FREE user audio clipping
    let userTier: UserTier = UserTier.FREE;
    if (userUuid) {
      try {
        userTier = await getUserTier(userUuid);
      } catch (e) {
        console.warn('[Async] Failed to get user tier:', e);
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
      cost_minutes: 0
    });

    // 6. 将任务加入队列（用于非供应商异步类型的兜底处理）
    await db().insert(q_jobs).values({
      job_id: jobId,
      tier: userUuid ? 'premium' : 'free',
      user_id: userUuid,
      created_at: new Date(),
      done: false
    });

    // 7. 立即返回job_id（先构造响应，再异步触发一次处理）
    const resp = NextResponse.json({
      success: true,
      job_id: jobId,
      status: 'processing',
      message: 'Transcription started successfully'
    });

    // 8. 根据 SUPPLIER_ASYNC 配置，尝试走供应商异步（仅对 audio_url 可用）；否则由 /process-one 处理
    try {
      const origin = new URL(request.url).origin;
      const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
      const cbBase = process.env.CALLBACK_BASE_URL || origin;
      if (type === 'audio_url' || type === 'file_upload') {
        // For FREE users with file_upload, clip the audio to 5 minutes
        let audioUrlForSupplier = content;
        if (type === 'file_upload' && userTier === 'free') {
          const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
          const clippedUrl = await clipAudioForFreeTier(content, jobId, 'file');
          
          if (clippedUrl) {
            audioUrlForSupplier = clippedUrl;
            // Update the processed_url in database for future reference
            await db().update(transcriptions)
              .set({ processed_url: audioUrlForSupplier })
              .where(eq(transcriptions.job_id, jobId));
          }
          // If clipping fails, audioUrlForSupplier remains as the original content
        }
        
        if ((supplier.includes('deepgram') || supplier === 'both') && process.env.DEEPGRAM_API_KEY) {
          let cb = `${cbBase}/api/callback/deepgram?job_id=${encodeURIComponent(jobId)}`;
          console.log('[Deepgram] Webhook secret configured:', !!process.env.DEEPGRAM_WEBHOOK_SECRET);

          // 使用 URLSearchParams 确保参数正确编码
          const params = new URLSearchParams();
          // Deepgram 不接受 callback_secret 查询参数；改为把签名放进回调 URL 本身
          if (process.env.DEEPGRAM_WEBHOOK_SECRET) {
            const sig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(jobId).digest('hex');
            cb = `${cb}&cb_sig=${sig}`;
          }
          params.set('callback', cb);
          // 明确指定回调方法
          params.set('callback_method', 'POST');

          // Deepgram 要求在 query 传 callback（不要传 callback_secret / callback_method）
          // 添加必要的参数来启用段落和句子分割
          const params2 = new URLSearchParams();
          params2.set('callback', cb);
          params2.set('paragraphs', 'true');  // 启用段落分割
          params2.set('punctuate', 'true');   // 启用标点符号
          params2.set('utterances', 'true');  // 启用说话人分离
          params2.set('model', 'nova-2');     // 使用 Nova-2 模型
          params2.set('detect_language', 'true'); // 启用语言检测
          // 不设置 language 参数，让 Deepgram 自动检测
          console.log('[Deepgram] Request params:', params2.toString());
          const dgResp = await fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: audioUrlForSupplier })
          }).catch((e) => { console.error('[Deepgram] enqueue failed(request):', e); });
          try {
            if (dgResp && !dgResp.ok) {
              const t = await dgResp.text();
              console.error('[Deepgram] enqueue non-200:', dgResp.status, t);
            }
          } catch {}
        }
        if ((supplier.includes('replicate') || supplier === 'both') && process.env.REPLICATE_API_TOKEN) {
          const cb = `${cbBase}/api/callback/replicate?job_id=${encodeURIComponent(jobId)}`;
          // Use Replicate predictions.create API
          await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              // Use the same whisper model as in ReplicateService
              // You can also use 'version' here; keeping model id for compatibility
              model: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
              input: { audio_file: audioUrlForSupplier, model: 'large-v3' },
              webhook: cb,
              webhook_events_filter: ['completed', 'failed'],
              ...(process.env.REPLICATE_WEBHOOK_SECRET ? { webhook_secret: process.env.REPLICATE_WEBHOOK_SECRET } : {})
            })
          }).catch(() => {});
        }
      } else if (type === 'youtube_url') {
        // 对 YouTube：快速解析直链并交给供应商（需要 SUPPLIER_ASYNC 设置）
        fetch(`${origin}/api/transcribe/prepare/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, video: content, user_tier: userTier })
        }).catch(() => {});
      } else {
        // 其他类型仅在显式开启兜底时触发本地处理
        if (process.env.PROCESS_ONE_FALLBACK === 'true') {
          fetch(`${origin}/api/transcribe/process-one`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId })
          }).catch(() => {});
        }
      }
    } catch {}

    return resp;

  } catch (error) {
    console.error('[Transcribe Async] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start transcription' },
      { status: 500 }
    );
  }
}
