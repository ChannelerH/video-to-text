import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { transcriptions, transcription_results } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const maxDuration = 10;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // 验证用户（允许匿名预览：userUuid 为空时仅允许访问 user_uuid 为空的任务）
    const userUuid = await getUserUuid();

    // 查询任务状态
    let whereClause;
    if (userUuid) {
      whereClause = and(eq(transcriptions.job_id, jobId), eq(transcriptions.user_uuid, userUuid));
    } else {
      // 仅允许匿名访问匿名任务
      whereClause = and(eq(transcriptions.job_id, jobId), eq(transcriptions.user_uuid, ''));
    }
    const [transcription] = await db().select().from(transcriptions).where(whereClause as any).limit(1);

    if (!transcription) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // 如果已完成，返回结果
    if (transcription.status === 'completed') {
      // 获取转录结果
      const results = await db()
        .select()
        .from(transcription_results)
        .where(eq(transcription_results.job_id, jobId));

      const resultMap: Record<string, any> = {};
      results.forEach(r => {
        resultMap[r.format] = r.content;
      });

      return NextResponse.json({
        status: 'completed',
        job_id: jobId,
        title: transcription.title,
        language: transcription.language,
        duration: transcription.duration_sec,
        results: resultMap,
        created_at: transcription.created_at,
        completed_at: transcription.completed_at
      });
    }

    // 返回当前状态
    return NextResponse.json({
      status: transcription.status,
      job_id: jobId,
      title: transcription.title,
      created_at: transcription.created_at,
      message: getStatusMessage(transcription.status)
    });

  } catch (error) {
    console.error('[Job Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    'queued': 'Your transcription is in queue',
    'processing': 'Transcription in progress...',
    'completed': 'Transcription completed',
    'failed': 'Transcription failed',
    'downloading': 'Downloading media...',
    'transcribing': 'Processing audio...',
    'refining': 'Refining transcript...'
  };
  return messages[status] || 'Processing...';
}
