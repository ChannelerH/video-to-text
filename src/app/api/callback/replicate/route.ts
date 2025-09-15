import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions, transcription_results } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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

    // Update summary fields
    const duration = Array.isArray(segments) && segments.length ? Math.ceil(segments[segments.length - 1]?.end || 0) : undefined;
    await db().update(transcriptions).set({
      status: 'completed',
      completed_at: new Date(),
      language: (language as any) || (undefined as any),
      duration_sec: (duration as any) || (undefined as any)
    } as any).where(eq(transcriptions.job_id, jobId));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'callback failed' }, { status: 500 });
  }
}
