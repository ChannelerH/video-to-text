import { NextRequest, NextResponse } from 'next/server';
import { transcriptionCache } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') as 'youtube' | 'user_file';
    const identifier = url.searchParams.get('id');
    const format = url.searchParams.get('format') || 'txt';
    const userId = url.searchParams.get('userId') || undefined;

    if (!type || !identifier) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: type and id' },
        { status: 400 }
      );
    }

    // 验证格式
    const validFormats = ['txt', 'srt', 'vtt', 'json', 'md'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { success: false, error: `Invalid format. Supported formats: ${validFormats.join(', ')}` },
        { status: 400 }
      );
    }

    // 从缓存获取转录结果
    const cacheEntry = await transcriptionCache.get(type, identifier, userId);
    if (!cacheEntry) {
      return NextResponse.json(
        { success: false, error: 'Transcription not found' },
        { status: 404 }
      );
    }

    // 获取指定格式的内容
    const content = cacheEntry.formats[format as keyof typeof cacheEntry.formats];
    if (!content) {
      return NextResponse.json(
        { success: false, error: `Format ${format} not available` },
        { status: 404 }
      );
    }

    // 生成文件名
    const title = cacheEntry.videoTitle || 'transcription';
    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const fileName = `${safeTitle}.${format}`;

    // 设置响应头
    const headers = new Headers();
    headers.set('Content-Type', getContentType(format));
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Content-Length', Buffer.byteLength(content, 'utf8').toString());

    console.log(`Downloading ${format} format for ${type}:${identifier} as ${fileName}`);

    return new NextResponse(content, { headers });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Download failed' 
      },
      { status: 500 }
    );
  }
}

// 获取文件的 MIME 类型
function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    txt: 'text/plain; charset=utf-8',
    srt: 'application/x-subrip; charset=utf-8',
    vtt: 'text/vtt; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8'
  };

  return contentTypes[format] || 'text/plain; charset=utf-8';
}

// POST 方法用于批量下载
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, identifier, formats, userId } = body;

    if (!type || !identifier || !formats || !Array.isArray(formats)) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 从缓存获取转录结果
    const cacheEntry = await transcriptionCache.get(type, identifier, userId);
    if (!cacheEntry) {
      return NextResponse.json(
        { success: false, error: 'Transcription not found' },
        { status: 404 }
      );
    }

    // 获取请求的格式内容
    const results: Record<string, string> = {};
    for (const format of formats) {
      const content = cacheEntry.formats[format as keyof typeof cacheEntry.formats];
      if (content) {
        results[format] = content;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        transcriptionId: cacheEntry.id,
        title: cacheEntry.videoTitle || 'transcription',
        language: cacheEntry.language,
        duration: cacheEntry.duration,
        formats: results,
        metadata: {
          createdAt: cacheEntry.createdAt,
          fromCache: true
        }
      }
    });

  } catch (error) {
    console.error('Batch download error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Batch download failed' 
      },
      { status: 500 }
    );
  }
}