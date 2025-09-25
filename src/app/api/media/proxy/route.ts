import { NextRequest } from 'next/server';
import { YouTubeService } from '@/lib/youtube';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  let src = req.nextUrl.searchParams.get('url');
  if (!src) return new Response('missing url', { status: 400 });

  // Fix double https:// issue
  if (src.startsWith('https://https://')) {
    console.warn('[Media Proxy] Fixing double https:// in URL:', src);
    src = src.replace('https://https://', 'https://');
  } else if (src.startsWith('http://http://')) {
    console.warn('[Media Proxy] Fixing double http:// in URL:', src);
    src = src.replace('http://http://', 'http://');
  }

  try {
    const url = new URL(src);
    const isYouTube = /(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname);

    // Special handling for YouTube: resolve audio via YouTubeService
    if (isYouTube) {
      try {
        const videoId = YouTubeService.validateAndParseUrl(src);
        if (!videoId) {
          return new Response('invalid youtube url', { status: 400 });
        }

        const audioUrl = await YouTubeService.getAudioStreamUrl(videoId);

        console.log('[Media Proxy] Audio URL:', audioUrl);
        
        const range = req.headers.get('range') || undefined;

        const upstream = await fetch(audioUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            ...(range ? { Range: range } : {}),
          },
        });

        if (!upstream.ok && upstream.status !== 206) {
          const message = await upstream.text().catch(() => '');
          return new Response(`upstream-error: ${upstream.status} ${message}`, { status: 502 });
        }

        if (!upstream.body) {
          return new Response('upstream returned empty body', { status: 502 });
        }

        const headers = new Headers();
        const contentType = upstream.headers.get('content-type') || 'audio/webm';
        headers.set('Content-Type', contentType);

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) headers.set('Content-Length', contentLength);

        const contentRange = upstream.headers.get('content-range');
        if (contentRange) headers.set('Content-Range', contentRange);

        const acceptRanges = upstream.headers.get('accept-ranges');
        if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

        headers.set('Cache-Control', 'no-store');
        headers.set('Access-Control-Allow-Origin', '*');

        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        });
      } catch (e: any) {
        return new Response(`youtube-proxy-error: ${e?.message || 'failed to stream'}`, { status: 502 });
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
