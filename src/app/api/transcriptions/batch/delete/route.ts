import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { and, eq, inArray } from 'drizzle-orm';
import { transcriptions, transcription_results, transcription_edits } from '@/db/schema';
import { getUserUuid } from '@/services/user';
import { readJson } from '@/lib/read-json';

export async function POST(req: NextRequest) {
  try {
    const user_uuid = await getUserUuid();
    if (!user_uuid) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    const { job_ids } = await readJson<{ job_ids?: string[] }>(req);
    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'invalid job_ids' }, { status: 400 });
    }

    // Delete child tables first
    await db().delete(transcription_results).where(inArray(transcription_results.job_id, job_ids));
    await db().delete(transcription_edits).where(and(eq(transcription_edits.user_uuid, user_uuid), inArray(transcription_edits.job_id, job_ids)));
    await db().delete(transcriptions).where(and(eq(transcriptions.user_uuid, user_uuid), inArray(transcriptions.job_id, job_ids)));

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Batch delete error:', e);
    return NextResponse.json({ success: false, error: 'failed' }, { status: 500 });
  }
}
