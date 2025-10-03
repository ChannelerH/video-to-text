import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { q_jobs, transcriptions, transcription_results } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { TranscriptionService } from '@/lib/transcription';

// This runs as a background job, can have longer timeout
export const maxDuration = 300; // 5 minutes for Pro plan

// Verify cron secret for security
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (support header or query string secret)
  const secret = CRON_SECRET || '';
  const authHeader = request.headers.get('authorization') || '';
  const url = new URL(request.url);
  const qsSecret = url.searchParams.get('secret') || '';
  if (secret && authHeader !== `Bearer ${secret}` && qsSecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. 获取待处理的任务（FIFO）
    const [job] = await db()
      .select()
      .from(q_jobs)
      .where(
        and(
          eq(q_jobs.done, false),
          isNull(q_jobs.picked_at)
        )
      )
      .orderBy(q_jobs.created_at)
      .limit(1);

    if (!job) {
      return NextResponse.json({ 
        message: 'No pending jobs',
        processed: 0 
      });
    }

    // 2. 标记任务为处理中
    await db()
      .update(q_jobs)
      .set({ picked_at: new Date() })
      .where(eq(q_jobs.id, job.id));

    // 3. 获取transcription记录
    const [transcription] = await db()
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.job_id, job.job_id))
      .limit(1);

    if (!transcription) {
      await markJobFailed(job.id, job.job_id, 'Transcription record not found');
      return NextResponse.json({ error: 'Job record not found' });
    }

    // 4. 更新状态为processing
    await db()
      .update(transcriptions)
      .set({ status: 'processing' })
      .where(eq(transcriptions.job_id, job.job_id));

    try {
      // 5. 执行转录处理（复用主业务 TranscriptionService，支持 YouTube / 音频直链 等）
      const service = new TranscriptionService(
        process.env.REPLICATE_API_TOKEN || '',
        process.env.DEEPGRAM_API_KEY
      );

    const preferredSourceUrl = transcription.processed_url || transcription.source_url || '';

    const req: any = {
      type: transcription.source_type,
      content: preferredSourceUrl,
      options: {
        language: transcription.language || 'auto',
        userId: job.user_id,
        userTier: job.tier || 'free',
        fallbackEnabled: true,
          isPreview: false
        }
      };

      const result = await service.processTranscription(req);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Transcription failed');
      }

      const t = result.data.transcription;
      const vf = result.data.videoInfo;
      const title = vf?.title || transcription.title || 'Untitled';

      // 6. 保存结果（保持与前端轮询协议兼容：json 存 segments 数组）
      const out: Record<string, string> = {
        txt: result.data.formats.txt || t.text || '',
        srt: result.data.formats.srt || '',
        vtt: result.data.formats.vtt || '',
        json: JSON.stringify(t.segments || [])
      };

      for (const format of Object.keys(out)) {
        const content = out[format];
        await db().insert(transcription_results).values({
          job_id: job.job_id,
          format: format,
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

      // 更新transcription状态
      await db()
        .update(transcriptions)
        .set({
          status: 'completed',
          title,
          duration_sec: Math.ceil(t.duration || 0),
          original_duration_sec: Math.ceil((vf?.duration || t.duration || 0)),
          cost_minutes: ((t.duration || 0) / 60).toFixed(3),
          completed_at: new Date()
        })
        .where(eq(transcriptions.job_id, job.job_id));

      // 标记任务完成
      await db()
        .update(q_jobs)
        .set({ done: true })
        .where(eq(q_jobs.id, job.id));

      return NextResponse.json({
        success: true,
        job_id: job.job_id,
        message: 'Job processed successfully'
      });

    } catch (error) {
      await markJobFailed(job.id, job.job_id, error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({
        error: 'Job processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('[Cron Job] Error:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Note: detailed processing moved inline above to reuse TranscriptionService

async function markJobFailed(jobId: number, jobIdStr: string, error: string) {
  // 更新任务状态为失败
  await db()
    .update(q_jobs)
    .set({ done: true })
    .where(eq(q_jobs.id, jobId));

  await db()
    .update(transcriptions)
    .set({ 
      status: 'failed',
      completed_at: new Date()
    })
    .where(eq(transcriptions.job_id, jobIdStr));

  console.error(`[Job Failed] ${jobIdStr}: ${error}`);
}
