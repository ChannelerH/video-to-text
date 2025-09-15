import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions, transcription_results } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Accept Deepgram callback. We map job_id via query string (?job_id=...)
// In prod, consider validating signature using DEEPGRAM_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  try {
    console.log('Deepgram callback received');
    
    // 打印所有headers用于调试
    const headers = Object.fromEntries(req.headers.entries());
    console.log('[Deepgram Callback] All headers:', headers);
    
    const jobId = req.nextUrl.searchParams.get('job_id') || '';
    if (!jobId) return NextResponse.json({ error: 'missing job_id' }, { status: 400 });

    const simulate = process.env.SIMULATE_CALLBACK === 'true';

    // Idempotency: if already completed, acknowledge
    try {
      const [tr] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);
      if (tr && (tr as any).status === 'completed') {
        return NextResponse.json({ ok: true, skipped: 'already_completed' });
      }
    } catch {}

    // Get raw body for signature validation
    const raw = await req.text();
    
    // Signature validation for Deepgram callbacks
    // Deepgram支持两种验证方式：
    // 1. 使用callback_secret参数（推荐）
    // 2. 使用API key作为HMAC密钥
    if (!simulate && process.env.DEEPGRAM_WEBHOOK_SECRET) {
      // 优先检查 Deepgram 官方签名头（不同命名变体）
      const sigHeader =
        req.headers.get('x-dg-signature') ||
        req.headers.get('x-deepgram-signature') ||
        req.headers.get('dg-signature') ||
        req.headers.get('x-signature');

      let verified = false;
      if (sigHeader) {
        const computed = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(raw).digest('hex');
        const given = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader;
        if (given.toLowerCase() === computed.toLowerCase()) {
          verified = true;
          console.log('[Deepgram Callback] Signature verified successfully');
        } else {
          console.error('[Deepgram Callback] Signature verification failed');
          console.log('Expected:', computed);
          console.log('Received:', given);
        }
      }

      // 若无官方签名或不匹配，允许使用我们埋在回调URL里的 HMAC 进行二次校验
      if (!verified) {
        const urlSig = req.nextUrl.searchParams.get('cb_sig') || '';
        if (urlSig) {
          const computedUrlSig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(jobId).digest('hex');
          if (computedUrlSig === urlSig) {
            verified = true;
            console.log('[Deepgram Callback] URL token verified');
          }
        }
      }

      if (!verified && process.env.DEEPGRAM_REQUIRE_SIGNATURE === 'true') {
        return NextResponse.json({ error: 'signature required' }, { status: 401 });
      }
    } else if (!simulate && process.env.DEEPGRAM_REQUIRE_SIGNATURE === 'true') {
      console.warn('[Deepgram Callback] DEEPGRAM_WEBHOOK_SECRET not configured but signature required');
      return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });
    }

    const payload = raw ? JSON.parse(raw) : ({} as any);
    
    // Debug: Log the structure to understand what Deepgram returns
    console.log('[Deepgram Callback] Response structure keys:', Object.keys(payload));
    if (payload.results?.channels?.[0]?.alternatives?.[0]) {
      const alt = payload.results.channels[0].alternatives[0];
      console.log('[Deepgram Callback] Alternative keys:', Object.keys(alt));
      if (alt.paragraphs) {
        console.log('[Deepgram Callback] Paragraphs structure:', JSON.stringify(alt.paragraphs).slice(0, 200));
      }
      if (alt.words) {
        console.log('[Deepgram Callback] Words count:', alt.words.length);
      }
    }

    // Try to extract transcript and segments
    let text = '';
    let segments: any[] = [];
    let language: string | undefined;
    try {
      if (payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
        text = String(payload.results.channels[0].alternatives[0].transcript || '');
      }
      // Build segments from Deepgram's paragraphs structure
      // Deepgram returns: paragraphs.paragraphs[] array, each with sentences[]
      const paragraphs = payload?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs || [];
      if (Array.isArray(paragraphs) && paragraphs.length > 0) {
        // Flatten all sentences from all paragraphs into segments
        segments = [];
        paragraphs.forEach((para: any) => {
          if (para.sentences && Array.isArray(para.sentences)) {
            para.sentences.forEach((s: any) => {
              segments.push({ 
                id: segments.length, 
                start: s.start || 0, 
                end: s.end || 0, 
                text: s.text || '' 
              });
            });
          }
        });
      }
      
      // Also check for words array as fallback (some Deepgram responses use this)
      if (segments.length === 0) {
        const words = payload?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
        if (Array.isArray(words) && words.length > 0) {
          // Group words into segments (simple approach: every 10-15 words or punctuation)
          let currentSegment: any = { text: '', start: 0, end: 0 };
          let wordCount = 0;
          
          words.forEach((word: any, idx: number) => {
            if (wordCount === 0) {
              currentSegment.start = word.start || 0;
            }
            currentSegment.text += (currentSegment.text ? ' ' : '') + (word.punctuated_word || word.word || '');
            currentSegment.end = word.end || 0;
            wordCount++;
            
            // Create segment at sentence end or every 15 words
            const isEndOfSentence = /[.!?]$/.test(word.punctuated_word || word.word || '');
            if (isEndOfSentence || wordCount >= 15 || idx === words.length - 1) {
              segments.push({
                id: segments.length,
                start: currentSegment.start,
                end: currentSegment.end,
                text: currentSegment.text.trim()
              });
              currentSegment = { text: '', start: 0, end: 0 };
              wordCount = 0;
            }
          });
        }
      }
      
      // Try multiple paths to get language
      language = payload?.results?.channels?.[0]?.detected_language || 
                 payload?.results?.channels?.[0]?.alternatives?.[0]?.languages?.[0] ||
                 payload?.metadata?.language;
      
      console.log('[Deepgram Callback] Language detection:', {
        detected_language: payload?.results?.channels?.[0]?.detected_language,
        languages_array: payload?.results?.channels?.[0]?.alternatives?.[0]?.languages,
        metadata_language: payload?.metadata?.language,
        final_language: language
      });
    } catch (e) {
      console.error('[Deepgram Callback] Error parsing segments:', e);
    }

    // Fallback to provided fields if our guess fails
    if (!text && typeof payload?.transcript === 'string') text = payload.transcript;
    if ((!segments || segments.length === 0) && Array.isArray(payload?.segments)) segments = payload.segments;

    // Persist results (txt + json + srt + vtt when possible)
    const txt = text || (Array.isArray(segments) ? segments.map((s: any) => s.text).join('\n') : '');
    const json = JSON.stringify(segments || []);
    let srt = '';
    let vtt = '';
    try {
      if (Array.isArray(segments) && segments.length > 0) {
        const { UnifiedTranscriptionService } = await import('@/lib/unified-transcription');
        const svc = new UnifiedTranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);
        const lastEnd = segments[segments.length - 1]?.end || 0;
        const tr: any = { text: txt, segments, language: language || 'unknown', duration: lastEnd };
        srt = svc.convertToSRT(tr);
        vtt = svc.convertToVTT(tr);
      }
    } catch {}

    for (const [format, content] of Object.entries({ txt, json, srt, vtt })) {
      if (!content) continue;
      await db().insert(transcription_results).values({
        job_id: jobId,
        format,
        content,
        size_bytes: Buffer.byteLength(content, 'utf-8'),
        created_at: new Date()
      }).onConflictDoUpdate({
        target: [transcription_results.job_id, transcription_results.format],
        set: {
          content,
          size_bytes: Buffer.byteLength(content, 'utf-8'),
          created_at: new Date()
        }
      });
    }

    const duration = Array.isArray(segments) && segments.length ? Math.ceil(segments[segments.length - 1]?.end || 0) : undefined;
    
    // 获取当前记录，只在标题是默认值时才更新
    const [currentTranscription] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);
    
    let updateData: any = {
      status: 'completed',
      completed_at: new Date(),
      language: (language as any) || (undefined as any),
      duration_sec: (duration as any) || (undefined as any)
    };
    
    // 只有当标题是默认值（Processing...、YouTube Video 等）时才生成新标题
    const currentTitle = currentTranscription?.title || '';
    const isDefaultTitle = currentTitle === 'Processing...' || 
                          currentTitle === 'YouTube Video' || 
                          currentTitle === 'Transcription' ||
                          currentTitle === '';
    
    if (isDefaultTitle && text) {
      // Generate a better title based on the first few words of the transcript
      const words = text.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 0) {
        // Take first 5-8 words as title
        const titleWords = words.slice(0, Math.min(8, words.length));
        let betterTitle = titleWords.join(' ');
        if (words.length > 8) {
          betterTitle += '...';
        }
        // Limit title length to 100 characters
        if (betterTitle.length > 100) {
          betterTitle = betterTitle.substring(0, 97) + '...';
        }
        updateData.title = betterTitle;
      }
    }
    
    await db().update(transcriptions).set(updateData).where(eq(transcriptions.job_id, jobId));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'callback failed' }, { status: 500 });
  }
}
