
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { CloudflareR2Service } from '@/lib/r2-upload';

export const runtime = 'nodejs';
export const maxDuration = 10; // keep it short

export async function POST(request: NextRequest) {
  let job_id: string | undefined;
  try {
    const body = await request.json();
    ({ job_id } = body);
    const { video, user_tier, preferred_language, enable_diarization_after_whisper } = body;
    console.log('[YouTube Prepare] incoming request', {
      job_id,
      hasVideo: typeof video === 'string' && video.length > 0,
      user_tier,
      preferred_language,
      enable_diarization_after_whisper,
    });
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
      if (job_id) {
        try {
          await db().update(transcriptions).set({ processed_url: supplierAudioUrl }).where(eq(transcriptions.job_id, job_id));
        } catch (e) {
          console.error('[YouTube Prepare] DB update failed:', e);
        }
      }
      
      // Send to Deepgram
      const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
      const origin = new URL(request.url).origin;
      const cbBase = process.env.CALLBACK_BASE_URL || origin;
      
      const enableDiarization = !!enable_diarization_after_whisper && ['basic', 'pro', 'premium'].includes(String(user_tier).toLowerCase());
      console.log('[YouTube Prepare] processed-url branch', {
        enableDiarization,
        supplier,
        hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
        supplierAudioUrl,
      });

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
        if (enableDiarization) {
          params.set('diarize', 'true');
        }
        console.log('[YouTube Prepare][Processed] Deepgram params', {
          params: params.toString(),
          enableDiarization,
          callback: cb,
        });

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
            resp.text().then((text) => console.error('[YouTube Prepare][Processed] Deepgram enqueue failed', resp.status, text)).catch(() => {});
          } else {
            console.log('[YouTube Prepare][Processed] Deepgram enqueue success');
          }
        }).catch((e) => { 
          console.error('[YouTube Prepare][Processed] Deepgram enqueue error', e);
        });
      }
      
      return NextResponse.json({ ok: true, rerun: true });
    }
    
    // Normal YouTube URL processing
    const { YouTubeService } = await import('@/lib/youtube');
    
    let vid: string | null = null;
    let audioUrl: string = '';
    let videoTitle: string | null = null;
    let videoDurationSeconds: number | null = null;
    
    try {
      vid = YouTubeService.validateAndParseUrl(video) || String(video);
    } catch (error) {
      console.error('[YouTube Prepare] Failed to parse YouTube URL:', error);
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
      audioUrl = await YouTubeService.getAudioStreamUrl(vid, preferred_language);
    } catch (error) {
      // Fallback 1: use optimized audio formats (but try to respect language preference)
      try {
        const fmts = await YouTubeService.getOptimizedAudioFormats(vid, preferred_language);
        const nonDrcFmts = fmts.filter(f => !f.isDrc);
        
        const pick = fmts.find(f => !!f.url) || fmts[0];
        if (pick?.url) {
          audioUrl = pick.url;
        }
      } catch (e) {
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
        console.warn('[YouTube Prepare] R2 not configured properly:', cfg);
      } else {
        const ytdl = (await import('@distube/ytdl-core')).default;
        
        // Get video info while we're at it (reuse ytdl import)
        try {
          const info = await ytdl.getBasicInfo(vid!);
          videoTitle = info.videoDetails?.title || null;
          videoDurationSeconds = parseInt(info.videoDetails?.lengthSeconds || '0') || null;
          console.log('[YouTube Prepare] Video info:', { 
            title: videoTitle, 
            durationSeconds: videoDurationSeconds,
            durationMinutes: videoDurationSeconds ? (videoDurationSeconds / 60).toFixed(2) : null
          });
        } catch (error) {
          console.error('[YouTube Prepare] Failed to get video info:', error);
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
        let stream: any;
        
        // 如果已经有了特定语言的URL，直接使用它（不要重新选择）
        if (audioUrl && expectedLang && itag) {
          try {
            // 直接使用已经选择好的URL，通过itag过滤确保获取正确的流
            stream = ytdl(vid!, {
              filter: (format: any) => {
                // 必须是音频格式
                if (!format.hasAudio || format.hasVideo) return false;
                
                // 检查itag
                const itagMatch = format.itag == itag || format.itag === Number(itag);
                if (!itagMatch) return false;
                
                // 检查语言标签
                if (format.url) {
                  try {
                    const fUrl = new URL(format.url);
                    const fXtags = fUrl.searchParams.get('xtags');
                    
                    // 必须匹配期望的语言和类型
                    if (fXtags) {
                      // 使用更精确的匹配，避免 en-US 匹配到 es-US
                      const xtagParts = fXtags.split(':');
                      const langTag = xtagParts.find(part => part.startsWith('lang='));
                      const typeTag = xtagParts.find(part => part.startsWith('acont='));
                      
                      const hasExpectedLang = langTag === `lang=${expectedLang}`;
                      const hasExpectedType = !expectedTrackType || typeTag === `acont=${expectedTrackType}`;
                      
                      if (hasExpectedLang && hasExpectedType) {
                        return true;
                      }
                    }
                  } catch (e) {}
                }
                return false;
              },
              highWaterMark: 1 << 24,
              requestOptions: {
                headers: { 
                  'User-Agent': 'Mozilla/5.0', 
                  'Accept-Language': 'en-US,en;q=0.9' 
                }
              }
            });
            
            // 不需要测试stream，ytdl会自动处理
            // 如果filter匹配到format，stream就是有效的
          } catch (e) {
            stream = null;
          }
        }
        
        // 如果没有预选的URL或失败了，尝试用filter选择特定语言
        if (!stream && expectedLang) {
          try {
            stream = ytdl(vid!, {
              filter: (format: any) => {
                // 只选择音频格式
                if (!format.hasAudio || format.hasVideo) return false;
                
                // 检查格式URL中的语言标签
                if (format.url && expectedLang) {
                  try {
                    const formatUrl = new URL(format.url);
                    const formatXtags = formatUrl.searchParams.get('xtags');
                    if (formatXtags) {
                      // 使用更精确的匹配，避免 en-US 匹配到 es-US
                      const xtagParts = formatXtags.split(':');
                      const langTag = xtagParts.find(part => part.startsWith('lang='));
                      const typeTag = xtagParts.find(part => part.startsWith('acont='));
                      
                      const hasExpectedLang = langTag === `lang=${expectedLang}`;
                      const hasExpectedType = !expectedTrackType || typeTag === `acont=${expectedTrackType}`;
                      
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
            
            // 不测试stream，让ytdl自己处理
            // stream将在实际使用时验证
          } catch (e) {
            stream = null;
          }
        }
        
        // 如果没有stream或者语言过滤失败，使用默认的最高质量音频
        if (!stream) {
          // 保留原始audioUrl的音轨选择（如果有）
          if (audioUrl && expectedLang) {
            // 尝试通过itag或其他方式获取特定音轨
            try {
              const urlObj = new URL(audioUrl);
              const itag = urlObj.searchParams.get('itag');
              if (itag) {
                // 使用特定的itag
                stream = ytdl(vid!, {
                  quality: itag,
                  highWaterMark: 1 << 24,
                  requestOptions: {
                    headers: { 
                      'User-Agent': 'Mozilla/5.0', 
                      'Accept-Language': 'en-US,en;q=0.9' 
                    }
                  }
                });
              }
            } catch (e) {
            }
          }
          
          // 最终fallback：默认最高质量音频
          if (!stream) {
            stream = ytdl(vid!, {
              quality: 'highestaudio',
              filter: 'audioonly',
              highWaterMark: 1 << 24,
              requestOptions: {
                headers: { 
                  'User-Agent': 'Mozilla/5.0', 
                  'Accept-Language': 'en-US,en;q=0.9' 
                }
              }
            });
          }
        }
        
        // For FREE users, we need to clip first (requires buffer)
        if (user_tier === 'free' || user_tier === 'FREE') {
          // Free users: download to buffer for clipping
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
          // Non-FREE users: use stream upload directly (no buffering)
          try {
            // Use S3Client directly for streaming upload
            const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
            const s3 = new S3Client({ 
              region: process.env.STORAGE_REGION || 'auto', 
              endpoint: process.env.STORAGE_ENDPOINT,
              credentials: {
                accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
                secretAccessKey: process.env.STORAGE_SECRET_KEY || ''
              }
            });

            // ytdl exposes format metadata via the `info` event; capture content length if available
            const contentLengthPromise = new Promise<number | undefined>((resolve) => {
              let done = false;
              const finalize = (len?: number) => {
                if (done) return;
                done = true;
                resolve(len);
              };
              stream.once('info', (_info: any, format: any) => {
                const len = format?.contentLength || format?.clen;
                const parsed = len ? Number(len) : undefined;
                finalize(Number.isFinite(parsed) ? parsed : undefined);
              });
              stream.once('error', () => finalize(undefined));
              // safety timeout to avoid hanging if info never fires
              setTimeout(() => finalize(undefined), 5000);
            });
            
            const key = `youtube-audio/${vid}_${Date.now()}.webm`;
            const bucket = process.env.STORAGE_BUCKET || '';
            const publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;

            const contentLength = await contentLengthPromise;

            const putParams: any = {
              Bucket: bucket,
              Key: key,
              Body: stream as any,  // Direct stream, no buffering
              ContentType: 'audio/webm',
              Metadata: {
                'upload-time': new Date().toISOString(),
                'source': 'youtube-prepare'
              }
            };
            if (contentLength && Number.isFinite(contentLength)) {
              putParams.ContentLength = contentLength;
            }

            await s3.send(new PutObjectCommand(putParams));
            
            const publicUrl = (publicDomain ? 
              (publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`) : 
              `https://pub-${bucket}.r2.dev`) + `/${key}`;
            
            supplierAudioUrl = publicUrl;
          } catch (streamError) {
            console.error('[YouTube Prepare] Stream upload failed, falling back to buffer upload:', streamError);
            
            // Fallback: create new stream and buffer it (保留语言选择)
            let fallbackStream;
            
            // 如果有语言偏好，尝试重新创建带语言过滤的stream
            if (expectedLang) {
              try {
                fallbackStream = ytdl(vid!, {
                  filter: (format: any) => {
                    if (!format.hasAudio || format.hasVideo) return false;
                    if (format.url && expectedLang) {
                      try {
                        const formatUrl = new URL(format.url);
                        const formatXtags = formatUrl.searchParams.get('xtags');
                        if (formatXtags) {
                          const hasExpectedLang = formatXtags.includes(`lang=${expectedLang}`);
                          const hasExpectedType = expectedTrackType ? formatXtags.includes(`acont=${expectedTrackType}`) : true;
                          if (hasExpectedLang && hasExpectedType && format.itag === 140) {
                            return true;
                          }
                        }
                      } catch (e) {}
                    }
                    return false;
                  },
                  highWaterMark: 1 << 24,
                  requestOptions: {
                    headers: { 
                      'User-Agent': 'Mozilla/5.0', 
                      'Accept-Language': 'en-US,en;q=0.9' 
                    }
                  }
                });
                
                // 不测试stream，让ytdl自己处理
              } catch (e) {
                fallbackStream = null;
              }
            }
            
            // 如果语言过滤失败，使用默认音频
            if (!fallbackStream) {
              fallbackStream = ytdl(vid!, {
                quality: 'highestaudio',
                filter: 'audioonly',
                highWaterMark: 1 << 24,
                requestOptions: {
                  headers: { 
                    'User-Agent': 'Mozilla/5.0', 
                    'Accept-Language': 'en-US,en;q=0.9' 
                  }
                }
              });
            }
            
            const chunks: Buffer[] = [];
            const buf: Buffer = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Download timeout after 30 seconds'));
              }, 30000);
              
              fallbackStream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
              fallbackStream.on('end', () => { 
                clearTimeout(timeout);
                resolve(Buffer.concat(chunks)); 
              });
              fallbackStream.on('error', (e: any) => { 
                clearTimeout(timeout);
                reject(e); 
              });
            });
            
            const upload = await r2.uploadFile(buf, `${vid}.webm`, 'audio/webm', 
              { folder: 'youtube-audio', expiresIn: 24, makePublic: true }
            );
            supplierAudioUrl = upload.publicUrl || upload.url;
          }
        }
      }
    } catch (e: any) {
      console.error('[YouTube Prepare] Failed to upload to R2:', e);
      // Don't fail the whole request, continue with direct YouTube URL if available
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
    const enableDiarization = !!enable_diarization_after_whisper && ['basic', 'pro', 'premium'].includes(String(user_tier).toLowerCase());

    console.log('[YouTube Prepare] fanout', {
      supplier,
      hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
      hasReplicateKey: !!process.env.REPLICATE_API_TOKEN,
      supplierAudioUrl,
      enableDiarization,
    });

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
          if (enableDiarization) {
            params2.set('diarize', 'true');
          }
          console.log('[YouTube Prepare][Fanout] Deepgram params', {
            params: params2.toString(),
            enableDiarization,
            callback: cb,
          });
          
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
              console.log('[Deepgram][prepare/youtube] enqueue success');
            }
          } catch (e) {
            console.error('[Deepgram][prepare/youtube] enqueue error', e);
          }
        })()
      );
    }

    // Only send to Replicate if we have a public R2 URL
    if (supplierAudioUrl && (supplier.includes('replicate') || supplier === 'both') && process.env.REPLICATE_API_TOKEN) {
      const cbUrl = new URL(`${cbBase}/api/callback/replicate`);
      cbUrl.searchParams.set('job_id', job_id);
      if (enableDiarization) cbUrl.searchParams.set('dw', '1');
      const cb = cbUrl.toString();
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

    // If we couldn't prepare R2 URL, try alternative S3 upload method (from staging logic)
    if (!supplierAudioUrl && vid) {
      try {
        
        // Use S3 client directly (more reliable for R2)
        const endpoint = process.env.STORAGE_ENDPOINT;
        const accessKeyId = process.env.STORAGE_ACCESS_KEY || '';
        const secretAccessKey = process.env.STORAGE_SECRET_KEY || '';
        const bucket = process.env.STORAGE_BUCKET || '';
        
        if (endpoint && accessKeyId && secretAccessKey && bucket) {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const s3 = new S3Client({ 
            region: process.env.STORAGE_REGION || 'auto', 
            endpoint, 
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true // Important for R2
          });
          
          const ytdl = (await import('@distube/ytdl-core')).default;
          const key = `youtube-audio/${vid}_${Date.now()}.webm`;
          
          // Download audio with fallback
          let stream: any;
          try {
            // Try to get the audio with the already obtained audioUrl if available
            if (audioUrl) {
              // Use the URL directly for downloading
              const response = await fetch(audioUrl, {
                headers: { 
                  'User-Agent': 'Mozilla/5.0', 
                  'Accept-Language': 'en-US,en;q=0.9' 
                }
              });
              if (response.ok && response.body) {
                // Convert response to stream-like object
                const reader = response.body.getReader();
                stream = new (await import('stream')).Readable({
                  async read() {
                    const { done, value } = await reader.read();
                    if (done) {
                      this.push(null);
                    } else {
                      this.push(Buffer.from(value));
                    }
                  }
                });
              }
            }
          } catch (e) {
          }
          
          // Fallback to ytdl if stream is not available
          if (!stream) {
            stream = ytdl(vid, {
              quality: 'highestaudio',
              filter: 'audioonly',
              highWaterMark: 1 << 24,
              requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } }
            });
          }
          
          // Collect into buffer
          const chunks: Buffer[] = [];
          const buffer: Buffer = await new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
            // Add timeout
            setTimeout(() => reject(new Error('Download timeout')), 60000);
          });
          
          // Handle Free tier 5-minute limit
          let uploadBuffer = buffer;
          let uploadKey = key;
          if (user_tier === 'free' || user_tier === 'FREE') {
            const { clipAudioFromBuffer } = await import('@/lib/audio-clip-helper');
            const clippedUrl = await clipAudioFromBuffer(buffer, vid, 'webm');
            if (clippedUrl) {
              supplierAudioUrl = clippedUrl;
            } else {
              // If clipping fails, upload the full buffer but mark it for frontend limiting
              console.warn('[YouTube Prepare] Failed to clip audio for free tier, uploading full audio');
            }
          }
          
          // If we don't have a clipped URL yet, upload the buffer
          if (!supplierAudioUrl) {
            await s3.send(new PutObjectCommand({
              Bucket: bucket,
              Key: uploadKey,
              Body: uploadBuffer,
              ContentType: 'audio/webm',
              ContentLength: uploadBuffer.length,
              Metadata: {
                'upload-time': new Date().toISOString(),
                'source': 'youtube-prepare',
                'user-tier': user_tier || 'unknown'
              }
            }));
            
            const publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
            supplierAudioUrl = (publicDomain ? (publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`) : `https://pub-${bucket}.r2.dev`) + `/${uploadKey}`;
          }
        }
      } catch (fallbackError) {
        console.error('[YouTube Prepare] S3 fallback upload also failed:', fallbackError);
        // Continue without R2 URL, will use direct YouTube URL
      }
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
          .where(eq(transcriptions.job_id, job_id));
      }
      
      return NextResponse.json({ ok: true, warning: 'prepare_failed' });
    }

    // Fire-and-forget
    Promise.allSettled(tasks).then((rs) => {
      // Check if all tasks failed
      const allFailed = rs.every(r => r.status === 'rejected');
      if (allFailed && rs.length > 0) {
        console.error('[YouTube Prepare] All supplier tasks failed');
        // Update status to failed if all suppliers failed
        if (job_id) {
          db().update(transcriptions)
            .set({ 
              status: 'failed',
              completed_at: new Date()
            })
            .where(eq(transcriptions.job_id, job_id))
            .catch(err => console.error('[YouTube Prepare] Failed to update status:', err));
        }
      }
    }).catch((e) => console.warn('[YouTube Prepare] Fan-out settle failed:', e));

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
          .where(eq(transcriptions.job_id, job_id));
      } catch (dbError) {
        console.error('[YouTube Prepare] Failed to update error status:', dbError);
      }
    }
    
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 });
  }
}
