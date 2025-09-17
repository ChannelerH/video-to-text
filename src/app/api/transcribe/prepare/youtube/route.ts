import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { CloudflareR2Service } from '@/lib/r2-upload';

export const runtime = 'nodejs';
export const maxDuration = 10; // keep it short

export async function POST(request: NextRequest) {
  try {
    const { job_id, video, user_tier, preferred_language } = await request.json();
    if (!job_id || !video) {
      return NextResponse.json({ error: 'missing job_id or video' }, { status: 400 });
    }


    // Check if this is already an R2/processed URL (from Re-run)
    const isProcessedUrl = video.includes('.r2.dev/') || video.includes('pub-') || video.includes('/api/media/proxy');
    
    if (isProcessedUrl) {
      
      // Directly use the R2 URL as supplier URL
      let supplierAudioUrl = video;
      
      // For FREE users, need to clip the R2 URL
      if (user_tier === 'free' || user_tier === 'FREE') {
        const { clipAudioForFreeTier } = await import('@/lib/audio-clip-helper');
        const clippedUrl = await clipAudioForFreeTier(video, job_id, 'rerun');
        
        if (clippedUrl) {
          supplierAudioUrl = clippedUrl;
        } else {
          // Fall back to full audio
        }
      }
      
      // Store the URL and proceed to Deepgram
      try {
        await db().update(transcriptions).set({ processed_url: supplierAudioUrl }).where(eq(transcriptions.job_id, job_id));
      } catch (e) {
        console.error('[YouTube Prepare] DB update failed:', e);
      }
      
      // Send to Deepgram
      const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
      const origin = new URL(request.url).origin;
      const cbBase = process.env.CALLBACK_BASE_URL || origin;
      
      if ((supplier.includes('deepgram') || supplier === 'both') && process.env.DEEPGRAM_API_KEY) {
        let cb = `${cbBase}/api/callback/deepgram?job_id=${encodeURIComponent(job_id)}`;
        if (process.env.DEEPGRAM_WEBHOOK_SECRET) {
          const sig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(job_id).digest('hex');
          cb = `${cb}&cb_sig=${sig}`;
        }
        
        const params = new URLSearchParams();
        params.set('callback', cb);
        params.set('paragraphs', 'true');
        params.set('punctuate', 'true');
        params.set('utterances', 'true');
        params.set('model', 'nova-2');
        params.set('detect_language', 'true');
        
        fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: supplierAudioUrl }),
          signal: AbortSignal.timeout(30000) // 30秒超时
        }).then(resp => {
          if (!resp.ok) {
          } else {
          }
        }).catch((e) => { 
        });
      }
      
      return NextResponse.json({ ok: true, rerun: true });
    }
    
    // Normal YouTube URL processing
    const { YouTubeService } = await import('@/lib/youtube');
    
    let vid: string | null = null;
    let audioUrl: string = '';
    let videoTitle: string | null = null;
    
    try {
      vid = YouTubeService.validateAndParseUrl(video) || String(video);
    } catch (error) {
      console.error('[YouTube Prepare] Failed to parse YouTube URL:', error);
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
      audioUrl = await YouTubeService.getAudioStreamUrl(vid, preferred_language);
    } catch (error) {
      console.log(`[YouTube Prepare] Failed to get audio stream with preferred language '${preferred_language}':`, error);
      // Fallback 1: use optimized audio formats (but try to respect language preference)
      try {
        const fmts = await YouTubeService.getOptimizedAudioFormats(vid, preferred_language);
        const nonDrcFmts = fmts.filter(f => !f.isDrc);
        
        const pick = fmts.find(f => !!f.url) || fmts[0];
        if (pick?.url) {
          audioUrl = pick.url;
          console.log('[YouTube Prepare] Using fallback audio format');
        }
      } catch (e) {
        console.log('[YouTube Prepare] Fallback 1 failed:', e);
      }

      // Fallback 2: accept any playable format url (video/mp4 with audio)
      if (!audioUrl) {
        try {
          const ytdl = (await import('@distube/ytdl-core')).default;
          const info = await ytdl.getInfo(vid);
          const playable = (info.formats || [])
            .filter((f: any) => f.url && (f.hasAudio || (f.mimeType || '').includes('audio/') || (f.mimeType || '').includes('video/mp4')))
            .sort((a: any, b: any) => (Number(b.bitrate || b.audioBitrate || 0) - Number(a.bitrate || a.audioBitrate || 0)));
          if (playable.length > 0) {
            audioUrl = playable[0].url;
          }
        } catch (e) {
        }
      }

      if (!audioUrl) {
        // As a last resort, do not fail the whole request; return ok with note
        return NextResponse.json({ ok: true, fallback: 'no_audio_url' });
      }
    }

    // Try to pre-upload audio to R2 for suppliers to fetch (preferred)
    let supplierAudioUrl: string | null = null;
    try {
      const r2 = new CloudflareR2Service();
      const cfg = r2.validateConfig();
      if (!cfg.isValid) {
      } else {
        const ytdl = (await import('@distube/ytdl-core')).default;
        
        // Get video info while we're at it (reuse ytdl import)
        try {
          const info = await ytdl.getBasicInfo(vid!);
          videoTitle = info.videoDetails?.title || null;
        } catch (error) {
        }
        
        // Stream audio (audioonly) and collect into buffer with a time cap to respect function limits
        
        // 从选定的音轨URL中提取关键参数
        const urlObj = new URL(audioUrl);
        const itag = urlObj.searchParams.get('itag');
        const xtags = urlObj.searchParams.get('xtags');
        
        // 提取期望的语言标签
        let expectedLang = '';
        let expectedTrackType = '';
        if (xtags) {
          const langMatch = xtags.match(/lang=([a-z]{2}(-[A-Z]{2})?)/i);
          const typeMatch = xtags.match(/acont=(original|dubbed-auto)/i);
          if (langMatch) expectedLang = langMatch[1];
          if (typeMatch) expectedTrackType = typeMatch[1];
        }
        
        // 使用 ytdl 下载，通过过滤器选择正确的音轨
        const stream: any = ytdl(vid!, {
          filter: (format: any) => {
            // 只选择音频格式
            if (!format.hasAudio || format.hasVideo) return false;
            
            // 检查格式URL中的语言标签
            if (format.url && expectedLang) {
              try {
                const formatUrl = new URL(format.url);
                const formatXtags = formatUrl.searchParams.get('xtags');
                if (formatXtags) {
                  // 确保语言和类型都匹配
                  const hasExpectedLang = formatXtags.includes(`lang=${expectedLang}`);
                  const hasExpectedType = expectedTrackType ? formatXtags.includes(`acont=${expectedTrackType}`) : true;
                  
                  // 优先选择 iTAG 140
                  if (hasExpectedLang && hasExpectedType) {
                    if (format.itag === 140) {
                      return true;
                    }
                  }
                }
              } catch (e) {
                // URL 解析失败，跳过
              }
            }
            return false;
          },
          highWaterMark: 1 << 24, // 16MB buffer
          requestOptions: {
            headers: { 
              'User-Agent': 'Mozilla/5.0', 
              'Accept-Language': 'en-US,en;q=0.9' 
            }
          }
        });
        
        const chunks: Buffer[] = [];
        const buf: Buffer = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Download timeout after 30 seconds'));
          }, 30000);
          
          stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
          stream.on('end', () => { 
            clearTimeout(timeout);
            resolve(Buffer.concat(chunks)); 
          });
          stream.on('error', (e: any) => { 
            clearTimeout(timeout);
            reject(e); 
          });
        });
        
        // For FREE users, clip the audio to 5 minutes before uploading
        if (user_tier === 'free' || user_tier === 'FREE') {
          const { clipAudioFromBuffer } = await import('@/lib/audio-clip-helper');
          const clippedUrl = await clipAudioFromBuffer(buf, vid!, 'webm');
          
          if (clippedUrl) {
            // We already have the clipped audio uploaded, just update supplierAudioUrl
            supplierAudioUrl = clippedUrl;
          } else {
            // Clipping failed, fall back to uploading full audio
            const upload = await r2.uploadFile(buf, `${vid}.webm`, 'audio/webm', 
              { folder: 'youtube-audio', expiresIn: 24, makePublic: true }
            );
            supplierAudioUrl = upload.publicUrl || upload.url;
          }
        } else {
          // Non-FREE users: upload full audio
          const upload = await r2.uploadFile(buf, `${vid}.webm`, 'audio/webm', 
            { folder: 'youtube-audio', expiresIn: 24, makePublic: true }
          );
          supplierAudioUrl = upload.publicUrl || upload.url;
        }
      }
    } catch (e: any) {
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
      
      // Update both processed_url and title (if available)
      await db().update(transcriptions).set(updateData).where(eq(transcriptions.job_id, job_id));
    } catch (e) {
      console.error('[YouTube Prepare] DB update failed:', e);
      return NextResponse.json({ error: 'db_update_failed' }, { status: 500 });
    }

    // Fan out to suppliers according to env
    const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
    const origin = new URL(request.url).origin;
    const cbBase = process.env.CALLBACK_BASE_URL || origin;
    // Provide suppliers with preferred R2 URL; fallback to our proxy URL if R2 not available
    const youtubeWatchUrl = `https://www.youtube.com/watch?v=${vid}`;
    const proxyUrl = `${origin}/api/media/proxy?url=${encodeURIComponent(youtubeWatchUrl)}`;
    const supplierUrl = supplierAudioUrl || proxyUrl;

    const tasks: Promise<any>[] = [];

    // Only send to Deepgram if we have a public R2 URL (proxy URL is not accessible from outside)
    if (supplierAudioUrl && (supplier.includes('deepgram') || supplier === 'both') && process.env.DEEPGRAM_API_KEY) {
      let cb = `${cbBase}/api/callback/deepgram?job_id=${encodeURIComponent(job_id)}`;
      if (process.env.DEEPGRAM_WEBHOOK_SECRET) {
        const sig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(job_id).digest('hex');
        cb = `${cb}&cb_sig=${sig}`;
      }
      const params = new URLSearchParams();
      params.set('callback', cb);
      params.set('callback_method', 'POST');
      // Deepgram 要求在 query 传 callback（不要传 callback_secret / callback_method）
      tasks.push(
        (async () => {
          const params2 = new URLSearchParams();
          params2.set('callback', cb);
          params2.set('paragraphs', 'true');  // 启用段落分割
          params2.set('punctuate', 'true');   // 启用标点符号
          params2.set('utterances', 'true');  // 启用说话人分离
          params2.set('model', 'nova-2');     // 使用 Nova-2 模型
          params2.set('detect_language', 'true'); // 启用语言检测
          
          try {
            const resp = await fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
              method: 'POST',
              headers: {
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json'
              },
              // Use R2 URL that Deepgram can access (not proxy URL)
              body: JSON.stringify({ url: supplierAudioUrl }),
              // 添加超时控制
              signal: AbortSignal.timeout(30000) // 30秒超时
            });
            
            if (!resp.ok) {
              const t = await resp.text();
              console.error('[Deepgram][prepare/youtube] enqueue non-200:', resp.status, t);
            } else {
            }
          } catch (e) {
            // 更详细的错误处理
          }
        })()
      );
    }

    // Only send to Replicate if we have a public R2 URL
    if (supplierAudioUrl && (supplier.includes('replicate') || supplier === 'both') && process.env.REPLICATE_API_TOKEN) {
      const cb = `${cbBase}/api/callback/replicate?job_id=${encodeURIComponent(job_id)}`;
      tasks.push(
        fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
            // Use R2 URL that Replicate can access
            input: { audio_file: supplierAudioUrl, model: 'large-v3' },
            webhook: cb,
            webhook_events_filter: ['completed', 'failed']
          })
        }).catch(() => {})
      );
    }

    // If we couldn't prepare R2 and video looks long, schedule staging worker and return quickly
    try {
      const { YouTubeService } = await import('@/lib/youtube');
      const info = await YouTubeService.getVideoInfo(vid!);
      const longVideo = (info.duration || 0) > 180; // >3 minutes
      if (longVideo && !supplierAudioUrl) {
        fetch(`${origin}/api/transcribe/stage/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id, video })
        }).catch(() => {});
        // Return early; staging will fan-out with R2 URL
        return NextResponse.json({ ok: true, staged: true });
      }
    } catch {}

    // Fire-and-forget
    Promise.allSettled(tasks).then((rs) => {
    }).catch((e) => console.warn('[YouTube Prepare] Fan-out settle failed:', e));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[YouTube Prepare] Uncaught error:', e);
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 });
  }
}
