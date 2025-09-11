import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('url');
  if (!src) return new Response('missing url', { status: 400 });

  const range = req.headers.get('range') || undefined;
  const upstream = await fetch(src, {
    headers: range ? { range } : undefined,
    cache: 'no-store',
  });

  // Stream through with original headers (keep 206 / Accept-Ranges / Content-Range)
  const headers = new Headers(upstream.headers);
  // Optional: allow cross-origin preview (same-origin pages不需要，但无害)
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(upstream.body, { status: upstream.status, headers });
}

