import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { q_jobs, transcriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getUserUuid } from '@/services/user';

const CANCELABLE_STATUSES = new Set([
  'queued',
  'processing',
  'downloading',
  'transcribing',
  'refining',
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { job } = await params;
    if (!job) {
      return NextResponse.json({ success: false, error: 'missing_job_id' }, { status: 400 });
    }

    const [record] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, job)).limit(1);
    if (!record) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    if (record.user_uuid && record.user_uuid !== userUuid) {
      return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403 });
    }

    if (record.status === 'cancelled') {
      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (!CANCELABLE_STATUSES.has(record.status)) {
      return NextResponse.json({
        success: false,
        status: record.status,
        error: 'not_cancellable',
      }, { status: 409 });
    }

    await db().update(transcriptions)
      .set({ status: 'cancelled', completed_at: new Date(), deleted: true })
      .where(eq(transcriptions.job_id, job));

    await db().update(q_jobs)
      .set({ done: true })
      .where(eq(q_jobs.job_id, job));

    return NextResponse.json({ success: true, status: 'cancelled' });
  } catch (error) {
    console.error('[Transcription Cancel] Error cancelling job:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
