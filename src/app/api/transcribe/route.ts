import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@/lib/transcription';
import { transcriptionCache } from '@/lib/cache';

// 初始化转录服务
const transcriptionService = new TranscriptionService(
  process.env.REPLICATE_API_TOKEN || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, content, options = {}, action = 'transcribe' } = body;

    // 验证必需参数
    if (!type || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: type and content' },
        { status: 400 }
      );
    }

    // 验证类型
    if (!['youtube_url', 'file_upload'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid type. Must be youtube_url or file_upload' },
        { status: 400 }
      );
    }

    // 根据动作类型处理请求
    if (action === 'preview') {
      console.log(`Generating preview for ${type}: ${content}`);
      const result = await transcriptionService.generatePreview({
        type,
        content,
        options
      });
      
      return NextResponse.json(result);
    } else {
      console.log(`Processing transcription for ${type}: ${content}`);
      const result = await transcriptionService.processTranscription({
        type,
        content,
        options
      });
      
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// 获取缓存状态和统计信息
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'stats') {
      const stats = transcriptionCache.getStats();
      const metrics = transcriptionCache.getCacheMetrics();
      
      return NextResponse.json({
        success: true,
        data: {
          cache: stats,
          metrics
        }
      });
    }

    if (action === 'check') {
      const type = url.searchParams.get('type') as 'youtube' | 'user_file';
      const identifier = url.searchParams.get('identifier');
      const userId = url.searchParams.get('userId') || undefined;

      if (!type || !identifier) {
        return NextResponse.json(
          { success: false, error: 'Missing type or identifier' },
          { status: 400 }
        );
      }

      const exists = await transcriptionCache.exists(type, identifier, userId);
      
      return NextResponse.json({
        success: true,
        data: { exists }
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}