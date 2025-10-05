import { NextRequest } from 'next/server';
import { readJson } from '@/lib/read-json';

// Anonymous-friendly TXT export helper for preview content (not persisted)
export async function POST(req: NextRequest) {
  try {
    const { text, filename } = await readJson<{ text?: string; filename?: string }>(req);
    const content = typeof text === 'string' ? text : '';
    if (!content) {
      return new Response(JSON.stringify({ success: false, error: 'invalid text' }), { status: 400 });
    }
    const name = (filename || 'preview').replace(/\s+/g, '_') + '.txt';
    const data = new TextEncoder().encode(content);
    return new Response(data, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), { status: 500 });
  }
}
