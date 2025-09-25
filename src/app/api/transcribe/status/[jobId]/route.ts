import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
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
    let transcription;
    try {
      const result = await db().select().from(transcriptions).where(whereClause as any).limit(1);
      transcription = result[0];
    } catch (error: any) {
      // 如果是连接错误，返回临时错误状态
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        return NextResponse.json(
          { error: 'Database connection temporarily unavailable. Please try again.' },
          { status: 503 }
        );
      }
      throw error; // 其他错误继续抛出
    }

    if (!transcription) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // 如果已完成，返回结果
    const effectiveTier: UserTier = userUuid ? await getUserTier(userUuid) : UserTier.FREE;

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
        completed_at: transcription.completed_at,
        tier: effectiveTier,
        source_type: transcription.source_type,
        source_url: transcription.source_url,
        processed_url: transcription.processed_url,
        original_duration_sec: transcription.original_duration_sec,
      });
    }

    // Check for staging issues
    let warning = null;
    if (transcription.processed_url && typeof transcription.processed_url === 'string' && 
        transcription.processed_url.startsWith('staging_failed:')) {
      warning = 'staging_failed';
      console.log('[Job Status] Staging failure detected for job:', jobId);
    }

    const createdAt = transcription.created_at ? new Date(transcription.created_at) : null;
    const shouldRetry = transcription.status === 'queued'
      && createdAt
      && Date.now() - createdAt.getTime() > 5 * 60 * 1000; // >2分钟仍 queued

    let errorCode: string | null = null;
    if (transcription.status === 'failed') {
      const processedUrl = transcription.processed_url || '';
      if (typeof processedUrl === 'string' && processedUrl.startsWith('download_failed:manual_upload_required')) {
        errorCode = 'youtube_manual_upload_required';
      }
    }

    const processedUrl
      = typeof transcription.processed_url === 'string' && transcription.processed_url.startsWith('download_failed:')
        ? null
        : transcription.processed_url;

    // 返回当前状态
    return NextResponse.json({
      status: transcription.status,
      job_id: jobId,
      title: transcription.title,
      created_at: transcription.created_at,
      message: getStatusMessage(transcription.status),
      tier: effectiveTier,
      source_type: transcription.source_type,
      source_url: transcription.source_url,
      processed_url: processedUrl,
      original_duration_sec: transcription.original_duration_sec,
      ...(warning && { warning }),
      ...(shouldRetry && { should_retry: true, retry_reason: 'queue_timeout' }),
      ...(errorCode && { error: errorCode, error_code: errorCode })
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
    'refining': 'Refining transcript...',
    'cancelled': 'Transcription cancelled'
  };
  return messages[status] || 'Processing...';
}
