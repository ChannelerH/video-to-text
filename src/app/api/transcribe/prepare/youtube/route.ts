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
    console.log('[YouTube Prepare] POST begin');
    const { job_id, video, user_tier } = await request.json();
    if (!job_id || !video) {
      return NextResponse.json({ error: 'missing job_id or video' }, { status: 400 });
    }

    console.log('[YouTube Prepare] Processing job:', job_id, 'video:', video, 'user_tier:', user_tier);

    // Check if this is already an R2/processed URL (from Re-run)
    const isProcessedUrl = video.includes('.r2.dev/') || video.includes('pub-') || video.includes('/api/media/proxy');
    
    if (isProcessedUrl) {
      console.log('[YouTube Prepare] Detected R2/processed URL from Re-run, skipping YouTube processing');
      
      // Directly use the R2 URL as supplier URL
      let supplierAudioUrl = video;
      
      // For FREE users, need to clip the R2 URL
      if (user_tier === 'free' || user_tier === 'FREE') {
        try {
          console.log('[YouTube Prepare] FREE user with R2 URL, clipping to 5 minutes');
          const { createWavClipFromUrl } = await import('@/lib/audio-clip');
          const { POLICY } = await import('@/services/policy');
          const maxSeconds = POLICY.preview.freePreviewSeconds || 300;
          
          const clippedBuffer = await createWavClipFromUrl(video, maxSeconds);
          
          // Upload clipped audio to R2
          const r2 = new CloudflareR2Service();
          const upload = await r2.uploadFile(
            clippedBuffer, 
            `rerun_free_${job_id}_${maxSeconds}s.wav`,
            'audio/wav',
            { folder: 'youtube-audio', expiresIn: 24, makePublic: true }
          );
          supplierAudioUrl = upload.publicUrl || upload.url;
          console.log(`[YouTube Prepare] FREE user R2 audio clipped and uploaded: ${supplierAudioUrl}`);
        } catch (e: any) {
          console.error('[YouTube Prepare] Failed to clip R2 URL for FREE user:', e);
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
          body: JSON.stringify({ url: supplierAudioUrl })
        }).catch((e) => { 
          console.error('[Deepgram][prepare/youtube] R2 URL enqueue failed:', e); 
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
      console.log('[YouTube Prepare] Extracted video ID:', vid);
    } catch (error) {
      console.error('[YouTube Prepare] Failed to parse YouTube URL:', error);
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
      audioUrl = await YouTubeService.getAudioStreamUrl(vid);
      console.log('[YouTube Prepare] Got audio URL:', audioUrl ? 'success' : 'failed');
    } catch (error) {
      console.warn('[YouTube Prepare] Primary audio URL extraction failed, applying fallbacks...', error);
      // Fallback 1: use optimized audio formats
      try {
        const fmts = await YouTubeService.getOptimizedAudioFormats(vid);
        const pick = fmts.find(f => !!f.url) || fmts[0];
        if (pick?.url) {
          audioUrl = pick.url;
          console.log('[YouTube Prepare] Fallback(optimized formats) succeeded');
        }
      } catch (e) {
        console.warn('[YouTube Prepare] Fallback optimized formats failed:', e);
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
            console.log('[YouTube Prepare] Fallback(any playable) succeeded');
          }
        } catch (e) {
          console.warn('[YouTube Prepare] Fallback(any playable) failed:', e);
        }
      }

      if (!audioUrl) {
        console.warn('[YouTube Prepare] All fallbacks failed to get audio URL');
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
        console.warn('[YouTube Prepare] R2 config missing, skip upload:', cfg.missing);
      } else {
        console.log('[YouTube Prepare] Starting short R2 upload window');
        const ytdl = (await import('@distube/ytdl-core')).default;
        
        // Get video info while we're at it (reuse ytdl import)
        try {
          const info = await ytdl.getBasicInfo(vid!);
          videoTitle = info.videoDetails?.title || null;
          console.log('[YouTube Prepare] Got video title:', videoTitle);
        } catch (error) {
          console.warn('[YouTube Prepare] Failed to get video title:', error);
        }
        
        // Stream audio (audioonly) and collect into buffer with a time cap to respect function limits
        const stream: any = ytdl(vid!, {
          quality: 'highestaudio',
          filter: 'audioonly',
          highWaterMark: 1 << 24, // 16MB buffer
          requestOptions: {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' }
          }
        });
        const chunks: Buffer[] = [];
        const buf: Buffer = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            try { stream.destroy(); } catch {}
            reject(new Error('r2_upload_timeout'));
          }, 8000);
          stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
          stream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
          stream.on('error', (e: any) => { clearTimeout(timer); reject(e); });
        });
        console.log('[YouTube Prepare] Audio buffered for R2 upload, size:', buf.length);
        
        // For FREE users, clip the audio to 5 minutes before uploading
        let audioToUpload = buf;
        let fileName = `${vid}.webm`;
        
        if (user_tier === 'free' || user_tier === 'FREE') {
          try {
            // First upload the full audio temporarily
            const tempUpload = await r2.uploadFile(buf, `temp_${vid}.webm`, 'audio/webm', { 
              folder: 'youtube-audio-temp', 
              expiresIn: 1, // 1 hour for temp file
              makePublic: true 
            });
            
            // Clip to 5 minutes using existing audio-clip utility
            console.log('[YouTube Prepare] FREE user detected, clipping audio to 5 minutes');
            const { createWavClipFromUrl } = await import('@/lib/audio-clip');
            const { POLICY } = await import('@/services/policy');
            const maxSeconds = POLICY.preview.freePreviewSeconds || 300;
            
            const clippedBuffer = await createWavClipFromUrl(tempUpload.url, maxSeconds);
            audioToUpload = clippedBuffer;
            fileName = `${vid}_free_${maxSeconds}s.wav`;
            
            console.log(`[YouTube Prepare] Audio clipped for FREE user: ${clippedBuffer.length} bytes (${maxSeconds}s)`);
          } catch (clipError: any) {
            console.error('[YouTube Prepare] Failed to clip audio for FREE user:', clipError?.message || clipError);
            // Fall back to full audio if clipping fails
          }
        }
        
        const upload = await r2.uploadFile(audioToUpload, fileName, 
          fileName.endsWith('.wav') ? 'audio/wav' : 'audio/webm', 
          { folder: 'youtube-audio', expiresIn: 24, makePublic: true }
        );
        supplierAudioUrl = upload.publicUrl || upload.url;
        console.log('[YouTube Prepare] R2 upload ok, url len:', supplierAudioUrl.length, 'file:', fileName);
      }
    } catch (e: any) {
      console.warn('[YouTube Prepare] R2 upload skipped/fail, will fallback to proxy URL:', e?.message || e);
    }

    // Store processed URL and title separately (keep original source_url intact)
    try {
      const processedUrl = supplierAudioUrl || audioUrl;
      console.log('[YouTube Prepare] Updating DB with processed URL (length):', (processedUrl || '').length, supplierAudioUrl ? '(r2)' : '(proxy)');
      
      // Build update object
      const updateData: any = { processed_url: processedUrl };
      
      // Update title if we got it from YouTube
      if (videoTitle) {
        updateData.title = videoTitle;
        console.log('[YouTube Prepare] Updating title to:', videoTitle);
      }
      
      // Update both processed_url and title (if available)
      await db().update(transcriptions).set(updateData).where(eq(transcriptions.job_id, job_id));
      console.log('[YouTube Prepare] DB update success - processed_url and title saved');
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
    console.log('[YouTube Prepare] Supplier config:', { supplier, hasDG: !!process.env.DEEPGRAM_API_KEY, hasRep: !!process.env.REPLICATE_API_TOKEN, cbBase, via: supplierAudioUrl ? 'r2' : 'proxy' });

    const tasks: Promise<any>[] = [];

    if ((supplier.includes('deepgram') || supplier === 'both') && process.env.DEEPGRAM_API_KEY) {
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
          console.log('[Deepgram][prepare/youtube] enqueue start');
          const params2 = new URLSearchParams();
          params2.set('callback', cb);
          params2.set('paragraphs', 'true');  // 启用段落分割
          params2.set('punctuate', 'true');   // 启用标点符号
          params2.set('utterances', 'true');  // 启用说话人分离
          params2.set('model', 'nova-2');     // 使用 Nova-2 模型
          params2.set('detect_language', 'true'); // 启用语言检测
          console.log('[Deepgram][prepare/youtube] Request params:', params2.toString());
          const resp = await fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'application/json'
            },
            // Use proxy URL so Deepgram can fetch without YouTube CDN restrictions
            body: JSON.stringify({ url: supplierUrl })
          }).catch((e) => { console.error('[Deepgram][prepare/youtube] enqueue failed(request):', e); return undefined as any; });
          try {
            if (resp && !resp.ok) {
              const t = await resp.text();
              console.error('[Deepgram][prepare/youtube] enqueue non-200:', resp.status, t);
            } else {
              console.log('[Deepgram][prepare/youtube] enqueue ok');
            }
          } catch (e) {
            console.error('[Deepgram][prepare/youtube] enqueue post-check failed:', e);
          }
        })()
      );
    }

    if ((supplier.includes('replicate') || supplier === 'both') && process.env.REPLICATE_API_TOKEN) {
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
            // Use proxy URL so Replicate can fetch without YouTube CDN restrictions
            input: { audio_file: supplierUrl, model: 'large-v3' },
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
        console.log('[YouTube Prepare] Long video without R2; scheduling staging worker');
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
      try { console.log('[YouTube Prepare] Fan-out settled:', rs.map(r => r.status)); } catch {}
    }).catch((e) => console.warn('[YouTube Prepare] Fan-out settle failed:', e));

    console.log('[YouTube Prepare] Done. Returning ok');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[YouTube Prepare] Uncaught error:', e);
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 });
  }
}
