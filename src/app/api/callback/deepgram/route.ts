import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { q_jobs, transcriptions, transcription_results } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { quotaTracker } from '@/services/quota-tracker';
import { getUserTier, UserTier } from '@/services/user-tier';
import { getUserSubscriptionPlan } from '@/services/user-subscription';
import { deductFromPacks } from '@/services/minutes';

export const runtime = 'nodejs';
export const maxDuration = 10; // Vercel limit

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

    // Idempotency: check if already processing or completed
    try {
      const [tr] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);
      if (tr && ((tr as any).status === 'completed' || (tr as any).status === 'processing')) {
        console.log(`[Deepgram Callback] Job ${jobId} already ${(tr as any).status}, skipping`);
        return NextResponse.json({ ok: true, skipped: `already_${(tr as any).status}` });
      }
      
      // Immediately mark as processing to prevent duplicates
      if (tr) {
        await db().update(transcriptions)
          .set({ status: 'processing' })
          .where(eq(transcriptions.job_id, jobId));
      }
    } catch (e) {
      console.error('[Deepgram Callback] Failed to check/update status:', e);
    }

    // Get raw body for signature validation
    const raw = await req.text();
    
    // Signature validation for Deepgram callbacks
    // Deepgram支持两种验证方式：
    // 1. 使用callback_secret参数（推荐）
    // 2. 使用API key作为HMAC密钥
    console.log('[Deepgram Callback] Starting signature validation...');
    console.log('[Deepgram Callback] DEEPGRAM_WEBHOOK_SECRET configured:', !!process.env.DEEPGRAM_WEBHOOK_SECRET);
    console.log('[Deepgram Callback] DEEPGRAM_REQUIRE_SIGNATURE:', process.env.DEEPGRAM_REQUIRE_SIGNATURE);
    console.log('[Deepgram Callback] URL params:', {
      job_id: jobId,
      cb_sig: req.nextUrl.searchParams.get('cb_sig')
    });
    
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
        console.log('[Deepgram Callback] Official signature not verified, checking URL signature...');
        const urlSig = req.nextUrl.searchParams.get('cb_sig') || '';
        console.log('[Deepgram Callback] URL signature present:', !!urlSig);
        
        if (urlSig) {
          const computedUrlSig = crypto.createHmac('sha256', process.env.DEEPGRAM_WEBHOOK_SECRET).update(jobId).digest('hex');
          console.log('[Deepgram Callback] URL sig comparison:');
          console.log('  - Expected (computed):', computedUrlSig);
          console.log('  - Received (from URL):', urlSig);
          console.log('  - Match:', computedUrlSig === urlSig);
          
          if (computedUrlSig === urlSig) {
            verified = true;
            console.log('[Deepgram Callback] URL token verified successfully');
          } else {
            console.log('[Deepgram Callback] URL token verification failed');
          }
        } else {
          console.log('[Deepgram Callback] No URL signature found in callback');
        }
      }

      if (!verified && process.env.DEEPGRAM_REQUIRE_SIGNATURE === 'true') {
        console.error('[Deepgram Callback] Signature verification failed, returning 401');
        console.log('[Deepgram Callback] Final verification status:', {
          verified,
          hadOfficialSignature: !!sigHeader,
          hadUrlSignature: !!req.nextUrl.searchParams.get('cb_sig')
        });
        return NextResponse.json({ error: 'signature required' }, { status: 401 });
      }
      
      if (!verified) {
        console.warn('[Deepgram Callback] Signature not verified but not required, proceeding...');
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
      
    } catch (e) {
      console.error('[Deepgram Callback] Error parsing segments:', e);
    }

    // Fallback to provided fields if our guess fails
    if (!text && typeof payload?.transcript === 'string') text = payload.transcript;
    if ((!segments || segments.length === 0) && Array.isArray(payload?.segments)) segments = payload.segments;

    // Apply Chinese refinement if detected
    if (language && text && segments) {
      try {
        // For Deepgram callback, trust the detected language since text may have spaces
        const isZh = language && language.toLowerCase().includes('zh');
        
        console.log('[Deepgram Callback] Chinese detection:', { language, isZh, textSample: text.substring(0, 50) });
        
        if (isZh) {
          console.log('[Deepgram Callback] Chinese detected, applying refinement');
          console.log('[Deepgram Callback] Original text with spaces:', text.substring(0, 100));
          
          // Use shared refinement logic
          const { applyChineseRefinement } = await import('@/lib/chinese-refinement');
          const refined = await applyChineseRefinement(text, segments, language);
          
          text = refined.text;
          segments = refined.segments;
          
          console.log('[Deepgram Callback] Chinese refinement completed, final text:', text.substring(0, 100));
        }
      } catch (e) {
        console.error('[Deepgram Callback] Error applying Chinese refinement:', e);
      }
    }

    // Persist results (txt + json + srt + vtt when possible)
    const txt = text || (Array.isArray(segments) ? segments.map((s: any) => s.text).join('\n') : '');
    const json = JSON.stringify(segments || []);
    let srt = '';
    let vtt = '';
    let md = '';
    let markdownSource: { svc: any; tr: any } | null = null;
    try {
      if (Array.isArray(segments) && segments.length > 0) {
        const { UnifiedTranscriptionService } = await import('@/lib/unified-transcription');
        const svc = new UnifiedTranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);
        const lastEnd = segments[segments.length - 1]?.end || 0;
        const tr: any = { text: txt, segments, language: language || 'unknown', duration: lastEnd };
        srt = svc.convertToSRT(tr);
        vtt = svc.convertToVTT(tr);
        markdownSource = { svc, tr };
      }
    } catch {}

    // Lazily compute markdown after fetching transcription to avoid extra queries
    const [currentTranscription] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);

    if (!md && markdownSource) {
      try {
        md = markdownSource.svc.convertToMarkdown(
          markdownSource.tr,
          currentTranscription?.title || 'Transcription'
        );
      } catch {}
    }

    for (const [format, content] of Object.entries({ txt, json, srt, vtt, md })) {
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

    const rawDuration = Array.isArray(segments) && segments.length
      ? Number(segments[segments.length - 1]?.end || 0)
      : Number(payload?.metadata?.duration || 0);
    const durationSec = rawDuration > 0 ? Math.ceil(rawDuration) : 0;
    const actualMinutes = rawDuration > 0 ? rawDuration / 60 : 0;
    const roundedMinutes = actualMinutes > 0 ? Number(actualMinutes.toFixed(3)) : 0;
    const usedHighAccuracy = false; // Deepgram callbacks correspond to standard accuracy
    
    // 获取当前记录，只在标题是默认值时才更新
    let updateData: any = {
      status: 'completed',
      completed_at: new Date(),
      language: (language as any) || (undefined as any),
      duration_sec: durationSec || undefined,
      original_duration_sec: durationSec || undefined,
      cost_minutes: roundedMinutes
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

    const userUuid = currentTranscription?.user_uuid || '';
    if (userUuid && roundedMinutes > 0) {
      try {
        const userTier = await getUserTier(userUuid);
        const subscriptionPlan = await getUserSubscriptionPlan(userUuid);
        if (subscriptionPlan === 'FREE') {
          const remain = await deductFromPacks(userUuid, actualMinutes, 'standard');
          const safeRemain = Math.max(0, remain);
          const packUsed = Math.max(0, actualMinutes - safeRemain);
          const packRounded = Math.max(0, Math.round(packUsed * 100) / 100);
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
      } catch (usageError) {
        console.error('[Deepgram Callback] Usage recording failed, applying fallback:', usageError);
        await quotaTracker.recordUsage(
          userUuid,
          Math.max(0.01, Math.round(actualMinutes * 100) / 100),
          usedHighAccuracy ? 'high_accuracy' : 'standard',
          'subscription'
        ).catch(() => {});
      }
    }

    await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.job_id, jobId)).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'callback failed' }, { status: 500 });
  }
}
