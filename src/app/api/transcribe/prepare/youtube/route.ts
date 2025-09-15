import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 10; // keep it short

export async function POST(request: NextRequest) {
  try {
    const { job_id, video } = await request.json();
    if (!job_id || !video) {
      return NextResponse.json({ error: 'missing job_id or video' }, { status: 400 });
    }

    // Resolve videoId and get direct audio URL quickly
    const { YouTubeService } = await import('@/lib/youtube');
    const vid = YouTubeService.validateAndParseUrl(video) || String(video);
    const audioUrl = await YouTubeService.getAudioStreamUrl(vid);

    // Update transcription record with resolved audio url (for traceability)
    await db().update(transcriptions).set({ source_url: audioUrl }).where(eq(transcriptions.job_id, job_id));

    // Fan out to suppliers according to env
    const supplier = (process.env.SUPPLIER_ASYNC || '').toLowerCase();
    const origin = new URL(request.url).origin;
    const cbBase = process.env.CALLBACK_BASE_URL || origin;

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
          const params2 = new URLSearchParams();
          params2.set('callback', cb);
          console.log('[Deepgram][prepare/youtube] Request params:', params2.toString());
          const resp = await fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: audioUrl })
          }).catch((e) => { console.error('[Deepgram][prepare/youtube] enqueue failed(request):', e); return undefined as any; });
          try {
            if (resp && !resp.ok) {
              const t = await resp.text();
              console.error('[Deepgram][prepare/youtube] enqueue non-200:', resp.status, t);
            }
          } catch {}
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
            input: { audio_file: audioUrl, model: 'large-v3' },
            webhook: cb,
            webhook_events_filter: ['completed', 'failed']
          })
        }).catch(() => {})
      );
    }

    // Fire-and-forget
    Promise.allSettled(tasks).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'prepare failed' }, { status: 500 });
  }
}
