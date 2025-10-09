import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { q_jobs, transcriptions, transcription_results } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { TranscriptionService } from '@/lib/transcription';
import { readJson } from '@/lib/read-json';

export const runtime = 'nodejs';
export const maxDuration = 300; // allow long processing

/**
 * Immediately process one pending job.
 * - Auth required; only processes the caller's job
 * - If job_id provided in body, try that one; else pick earliest pending for this user
 */
export async function POST(request: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let jobIdFromBody: string | undefined;
    try {
      const body = await readJson<{ job_id?: string }>(request);
      jobIdFromBody = body?.job_id;
    } catch {}

    // Find a pending job for this user
    let jobRow: any | undefined;
    if (jobIdFromBody) {
      const [row] = await db()
        .select()
        .from(q_jobs)
        .where(and(eq(q_jobs.job_id, jobIdFromBody), eq(q_jobs.user_id, userUuid), eq(q_jobs.done, false)))
        .limit(1);
      jobRow = row;
    }

    if (!jobRow) {
      const [row] = await db()
        .select()
        .from(q_jobs)
        .where(and(eq(q_jobs.user_id, userUuid), eq(q_jobs.done, false), isNull(q_jobs.picked_at)))
        .orderBy(q_jobs.created_at)
        .limit(1);
      jobRow = row;
    }

    if (!jobRow) {
      return NextResponse.json({ success: true, processed: 0, message: 'No pending jobs for user' });
    }

    // Mark picked
    await db().update(q_jobs).set({ picked_at: new Date() }).where(eq(q_jobs.id, jobRow.id));

    // Load transcription record
    const [tr] = await db().select().from(transcriptions).where(eq(transcriptions.job_id, jobRow.job_id)).limit(1);
    if (!tr) {
      await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.id, jobRow.id));
      return NextResponse.json({ success: false, error: 'Transcription record not found' }, { status: 404 });
    }

    // Update to processing
    await db().update(transcriptions).set({ status: 'processing' }).where(eq(transcriptions.job_id, jobRow.job_id));

    const service = new TranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);
    const preferredSourceUrl = tr.processed_url || tr.source_url || '';

    const req: any = {
      type: tr.source_type,
      content: preferredSourceUrl,
      options: {
        language: tr.language || 'auto',
        userId: userUuid,
        userTier: jobRow.tier || 'free',
        fallbackEnabled: true,
        isPreview: false,
        jobId: jobRow.job_id
      }
    };

    try {
      const result = await service.processTranscription(req);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Transcription failed');
      }

      const t = result.data.transcription;

      const out: Record<string, string> = {
        txt: result.data.formats.txt || t.text || '',
        srt: result.data.formats.srt || '',
        vtt: result.data.formats.vtt || '',
        json: JSON.stringify(t.segments || [])
      };

      for (const format of Object.keys(out)) {
        const content = out[format];
        await db().insert(transcription_results).values({
          job_id: jobRow.job_id,
          format,
          content,
          size_bytes: Buffer.byteLength(content, 'utf-8'),
          created_at: new Date()
        }).onConflictDoUpdate({
          target: [transcription_results.job_id, transcription_results.format],
          set: {
            content,
            size_bytes: Buffer.byteLength(content, 'utf-8'),
            created_at: new Date()
          }
        });
      }

      const durationSec = Math.ceil(t.duration || 0);

      // Only update title if it's a default value and we have a valid new title
      const currentTitle = tr.title || '';
      const isDefaultTitle = currentTitle === 'Processing...' ||
                            currentTitle === 'YouTube Video' ||
                            currentTitle === 'Transcription' ||
                            currentTitle === '';

      const newTitle = result.data.videoInfo?.title;
      const hasValidNewTitle = typeof newTitle === 'string' && newTitle.trim().length > 0;

      console.log('[Process-One] Title check:', {
        jobId: jobRow.job_id,
        currentTitle,
        isDefaultTitle,
        newTitle,
        hasValidNewTitle,
        willUpdateTitle: isDefaultTitle && hasValidNewTitle,
      });

      const updateTranscription: any = {
        status: 'completed',
        duration_sec: durationSec,
        cost_minutes: Number(((t.duration || 0) / 60).toFixed(3)),
        completed_at: new Date()
      };

      // Only update title if current is default and new title is valid
      if (isDefaultTitle && hasValidNewTitle) {
        updateTranscription.title = newTitle.trim();
        console.log('[Process-One] Updating title to:', newTitle.trim());
      } else {
        console.log('[Process-One] Keeping existing title:', currentTitle);
      }

      const existingOriginalSec = Number(tr.original_duration_sec || 0);
      if (durationSec > 0) {
        if (existingOriginalSec <= 0 || durationSec > existingOriginalSec) {
          updateTranscription.original_duration_sec = durationSec;
        }
      } else if (existingOriginalSec <= 0) {
        updateTranscription.original_duration_sec = 0;
      }

      console.log('[Process-One] Final updateTranscription BEFORE DB update:', {
        jobId: jobRow.job_id,
        updateTranscription,
      });

      await db().update(transcriptions).set(updateTranscription).where(eq(transcriptions.job_id, jobRow.job_id));

      console.log('[Process-One] DB update completed for job:', jobRow.job_id);

      await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.id, jobRow.id));

      return NextResponse.json({ success: true, job_id: jobRow.job_id });
    } catch (e: any) {
      await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.id, jobRow.id));
      await db().update(transcriptions).set({ status: 'failed', completed_at: new Date() }).where(eq(transcriptions.job_id, jobRow.job_id));
      return NextResponse.json({ success: false, error: e?.message || 'processing failed' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
