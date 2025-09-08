import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getTranscription } from '@/models/transcription';
import { buildZip } from '@/lib/zip';

function sanitizeName(s: string): string {
  return (s || 'transcription')
    .replace(/[^\w\s\-\u4e00-\u9fff]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

function formatStamp(value: any): string {
  const d = new Date(value || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  // compact, filesystem-safe
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

export async function POST(req: NextRequest) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.job_ids) ? body.job_ids : [];
  if (ids.length === 0) return NextResponse.json({ success: false, error: 'empty' }, { status: 400 });

  const files: { name: string; data: Uint8Array }[] = [];
  for (const id of ids) {
    const row = await getTranscription(id, user_uuid);
    if (!row) continue; // skip foreign/invalid ids silently
    const title = sanitizeName(row.job?.title || id);
    const stamp = formatStamp(row.job?.created_at);
    const dir = `${title}_${stamp}`;
    const fmts = row.formats || {};
    for (const key of Object.keys(fmts)) {
      const ext = key.toLowerCase();
      const filename = `${dir}/${title}.${ext}`;
      const data = new TextEncoder().encode(String(fmts[key]));
      files.push({ name: filename, data });
    }
  }

  if (files.length === 0) return NextResponse.json({ success: false, error: 'no_files' }, { status: 404 });

  const zip = buildZip(files);
  return new NextResponse(zip, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="transcriptions.zip"',
      'Cache-Control': 'no-cache'
    }
  });
}
