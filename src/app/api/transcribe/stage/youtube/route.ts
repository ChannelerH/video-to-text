import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import ytdl from '@distube/ytdl-core';

export const runtime = 'nodejs';
export const maxDuration = 300; // allow longer running staging

export async function POST(req: NextRequest) {
  try {
    const { job_id, video } = await req.json();
    if (!job_id || !video) {
      return NextResponse.json({ success: false, error: 'missing job_id or video' }, { status: 400 });
    }

    // Parse video id
    let vid: string | null = null;
    try {
      const { YouTubeService } = await import('@/lib/youtube');
      vid = YouTubeService.validateAndParseUrl(video) || String(video);
    } catch {}
    if (!vid) return NextResponse.json({ success: false, error: 'invalid_video' }, { status: 400 });

    // Init S3 client for R2
    const endpoint = process.env.STORAGE_ENDPOINT;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY || '';
    const secretAccessKey = process.env.STORAGE_SECRET_KEY || '';
    const bucket = process.env.STORAGE_BUCKET || '';
    const publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return NextResponse.json({ success: false, error: 'r2_not_configured' }, { status: 500 });
    }

    const s3 = new S3Client({ region: process.env.STORAGE_REGION || 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });

    // Stream download from YouTube and upload to R2 in one go (no buffering large files)
    const key = `youtube-audio-full/${vid}_${Date.now()}.webm`;
    const stream: any = ytdl(vid, {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 24,
      requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' } }
    });

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: stream as any,
      ContentType: 'audio/webm',
      Metadata: {
        'upload-time': new Date().toISOString(),
        'source': 'youtube-stage'
      }
    }));

    const publicUrl = (publicDomain ? (publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`) : `https://pub-${bucket}.r2.dev`) + `/${key}`;

    // Update DB with R2 URL
    await db().update(transcriptions).set({ source_url: publicUrl }).where(eq(transcriptions.job_id, job_id));

    // Fan out to suppliers using the R2 URL
    const origin = new URL(req.url).origin;
    const cbBase = process.env.CALLBACK_BASE_URL || origin;

    const tasks: Promise<any>[] = [];
    if (process.env.DEEPGRAM_API_KEY) {
      const cb = `${cbBase}/api/callback/deepgram?job_id=${encodeURIComponent(job_id)}`;
      const params2 = new URLSearchParams();
      params2.set('callback', cb);
      params2.set('paragraphs', 'true');
      params2.set('punctuate', 'true');
      params2.set('utterances', 'true');
      params2.set('model', 'nova-2');
      params2.set('detect_language', 'true');
      tasks.push(fetch(`https://api.deepgram.com/v1/listen?${params2.toString()}`, {
        method: 'POST',
        headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl })
      }).catch(() => {}));
    }
    if (process.env.REPLICATE_API_TOKEN) {
      const cb = `${cbBase}/api/callback/replicate?job_id=${encodeURIComponent(job_id)}`;
      tasks.push(fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
          input: { audio_file: publicUrl, model: 'large-v3' },
          webhook: cb,
          webhook_events_filter: ['completed', 'failed']
        })
      }).catch(() => {}));
    }
    Promise.allSettled(tasks).catch(() => {});

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'stage_failed' }, { status: 500 });
  }
}

