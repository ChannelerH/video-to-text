import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { q_jobs, transcriptions } from '@/db/schema';
import { getUniSeq } from '@/lib/hash';
import crypto from 'crypto';

export const maxDuration = 10; // Vercel hobby limit

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. 解析请求
    const body = await request.json();
    const { type, content, options = {} } = body;

    // 3. 验证输入
    if (!type || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. 生成任务ID（使用内置序列工具，避免新增依赖）
    const jobId = getUniSeq('job_');
    const sourceHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

    // 5. 创建占位transcription记录
    await db().insert(transcriptions).values({
      job_id: jobId,
      user_uuid: userUuid,
      source_type: type,
      source_hash: sourceHash,
      source_url: type === 'youtube_url' || type === 'audio_url' ? content : null,
      title: options.title || 'Processing...',
      language: options.language || 'auto',
      status: 'queued',
      created_at: new Date(),
      deleted: false,
      duration_sec: 0,
      original_duration_sec: 0,
      cost_minutes: 0
    });

    // 6. 将任务加入队列
    await db().insert(q_jobs).values({
      job_id: jobId,
      tier: userUuid ? 'premium' : 'free',
      user_id: userUuid,
      created_at: new Date(),
      done: false
    });

    // 7. 立即返回job_id
    return NextResponse.json({
      success: true,
      job_id: jobId,
      status: 'processing',  // 改为processing，不暴露queued状态
      message: 'Transcription started successfully'
    });

  } catch (error) {
    console.error('[Transcribe Async] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start transcription' },
      { status: 500 }
    );
  }
}
