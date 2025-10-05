import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';

const HEADER_KEY = 'x-worker-secret';

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const secret = process.env.WORKER_UPLOAD_SECRET;
  if (!secret) {
    console.error('[Worker Callback] Missing WORKER_UPLOAD_SECRET configuration');
    return NextResponse.json({ error: 'worker integration not configured' }, { status: 500 });
  }

  const provided = request.headers.get(HEADER_KEY) || request.nextUrl.searchParams.get('secret');
  if (!provided || provided !== secret) {
    console.warn('[Worker Callback] Invalid secret provided for job', params.jobId);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const jobId = params.jobId;
  if (!jobId) {
    return NextResponse.json({ error: 'missing job id' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    console.error('[Worker Callback] Failed to parse request body', error);
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const processedUrl = typeof body?.processedUrl === 'string' ? body.processedUrl.trim() : '';
  if (!processedUrl) {
    return NextResponse.json({ error: 'processedUrl is required' }, { status: 400 });
  }

  const meta: Record<string, any> = {};
  if (typeof body?.videoId === 'string' && body.videoId.length > 0) {
    meta.videoId = body.videoId;
  }
  if (typeof body?.sourceHash === 'string' && body.sourceHash.length > 0) {
    meta.sourceHash = body.sourceHash;
  }

  try {
    const updateData: Record<string, any> = { processed_url: processedUrl };
    if (meta.videoId && meta.sourceHash) {
      updateData.source_hash = meta.sourceHash;
    }

    const result = await db()
      .update(transcriptions)
      .set(updateData)
      .where(and(eq(transcriptions.job_id, jobId), ne(transcriptions.status, 'cancelled')))
      .returning({ id: transcriptions.id, status: transcriptions.status });

    if (!result.length) {
      console.warn('[Worker Callback] No transcription updated for job', jobId);
      return NextResponse.json({ updated: false, reason: 'not_found_or_cancelled' }, { status: 404 });
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('[Worker Callback] Failed to update processed_url', { jobId, error });
    return NextResponse.json({ error: 'failed to update processed_url' }, { status: 500 });
  }
}
