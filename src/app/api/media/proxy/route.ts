import { NextRequest } from 'next/server';
import ytdl from '@distube/ytdl-core';
import { Readable } from 'stream';

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('url');
  if (!src) return new Response('missing url', { status: 400 });

  try {
    const url = new URL(src);
    const isYouTube = /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname);

    // Special handling for YouTube: stream audio via ytdl-core
    if (isYouTube) {
      try {
        const stream = ytdl(src, {
          quality: 'highestaudio',
          filter: 'audioonly',
          highWaterMark: 1 << 25, // 32MB buffer for smoother streaming
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          }
        }) as unknown as Readable;

        // Convert Node stream to Web ReadableStream
        const webStream = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            stream.on('end', () => controller.close());
            stream.on('error', (err: any) => controller.error(err));
          },
          cancel() { try { stream.destroy(); } catch { /* noop */ } }
        });

        return new Response(webStream, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mp4',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (e: any) {
        return new Response(`ytdl-error: ${e?.message || 'failed to stream'}`, { status: 502 });
      }
    }

    // Generic proxy for direct audio/video URLs with Range support
    const range = req.headers.get('range') || undefined;
    const upstream = await fetch(src, {
      headers: range ? { range } : undefined,
      cache: 'no-store',
    });

    const ct = upstream.headers.get('content-type') || '';
    if (!ct.startsWith('audio/') && !ct.startsWith('video/')) {
      // Prevent decoding errors when upstream is HTML (e.g., YouTube watch page)
      console.error(`Unsupported content-type: ${ct} for URL: ${src}`);
      return new Response(`unsupported content-type: ${ct}`, { status: 415 });
    }

    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.delete('content-encoding'); // let browser handle raw stream

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err: any) {
    return new Response(`proxy-error: ${err?.message || 'unknown'}`, { status: 500 });
  }
}
