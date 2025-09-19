import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { q_jobs, transcriptions, transcription_results } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { quotaTracker } from '@/services/quota-tracker';
import { getUserTier, UserTier } from '@/services/user-tier';
import { deductFromPacks } from '@/services/minutes';

export const runtime = 'nodejs';
export const maxDuration = 10;

// Replicate webhook for predictions. The body typically includes id/status/output.
export async function POST(req: NextRequest) {
  try {
    console.log('Replicate callback received');
    
    const jobId = req.nextUrl.searchParams.get('job_id') || '';
    if (!jobId) return NextResponse.json({ error: 'missing job_id' }, { status: 400 });

    // Idempotency: skip if already completed
    try {
      const [tr] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);
      if (tr && (tr as any).status === 'completed') {
        return NextResponse.json({ ok: true, skipped: 'already_completed' });
      }
    } catch {}

    const simulate = process.env.SIMULATE_CALLBACK === 'true';
    const secret = process.env.REPLICATE_WEBHOOK_SECRET || '';
    const raw = await req.text();
    if (!simulate && secret) {
      const sig = req.headers.get('x-replicate-signature') || req.headers.get('x-signature') || '';
      const computed = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const given = sig.startsWith('sha256=') ? sig.slice(7) : sig;
      if (!given || given.toLowerCase() !== computed.toLowerCase()) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }
    }

    const body = raw ? JSON.parse(raw) : {};
    const status = String(body?.status || '').toLowerCase();

    if (status === 'failed' || status === 'canceled') {
      await db().update(transcriptions).set({ status: 'failed', completed_at: new Date() }).where(eq(transcriptions.job_id, jobId));
      await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.job_id, jobId)).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    // Extract transcript results. Support both nested and direct outputs.
    let transcriptionText = '';
    let segments: any[] = [];
    let language: string | undefined;
    try {
      const out = body?.output?.output || body?.output || {};
      if (typeof out?.transcription === 'string') transcriptionText = out.transcription;
      if (Array.isArray(out?.segments)) segments = out.segments;
      if (typeof out?.detected_language === 'string') language = out.detected_language;
    } catch {}

    const txt = transcriptionText || (segments.length ? segments.map((s: any) => s.text).join('\n') : '');
    const json = JSON.stringify(segments || []);

    // Try to generate SRT/VTT when we have segments
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

    const rawDuration = Array.isArray(segments) && segments.length ? Number(segments[segments.length - 1]?.end || 0) : Number(body?.output?.duration || 0);
    const durationSec = rawDuration > 0 ? Math.ceil(rawDuration) : 0;
    const actualMinutes = rawDuration > 0 ? rawDuration / 60 : 0;
    const roundedMinutes = actualMinutes > 0 ? Number(actualMinutes.toFixed(3)) : 0;
    const usedHighAccuracy = req.nextUrl.searchParams.get('ha') === '1' ||
      (body?.input?.model && String(body.input.model).toLowerCase().includes('large'));

    const [currentTranscription] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobId)).limit(1);

    // Update transcription metadata
    const updatePayload: any = {
      status: 'completed',
      completed_at: new Date(),
      language: (language as any) || (undefined as any),
      duration_sec: durationSec || undefined,
      original_duration_sec: durationSec || undefined,
      cost_minutes: roundedMinutes
    };

    if (currentTranscription) {
      const currentTitle = currentTranscription.title || '';
      const defaultTitles = new Set(['Processing...', 'YouTube Video', 'Transcription', '']);
      if (defaultTitles.has(currentTitle) && txt) {
        const words = txt.split(/\s+/).filter(Boolean);
        if (words.length > 0) {
          let title = words.slice(0, Math.min(8, words.length)).join(' ');
          if (words.length > 8) title += '...';
          if (title.length > 100) title = `${title.slice(0, 97)}...`;
          updatePayload.title = title;
        }
      }
    }

    await db().update(transcriptions).set(updatePayload).where(eq(transcriptions.job_id, jobId));

    const userUuid = currentTranscription?.user_uuid || '';
    if (userUuid && roundedMinutes > 0) {
      try {
        const userTier = await getUserTier(userUuid);
        if (userTier === UserTier.FREE) {
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
        console.error('[Replicate Callback] Usage recording failed, applying fallback:', usageError);
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
