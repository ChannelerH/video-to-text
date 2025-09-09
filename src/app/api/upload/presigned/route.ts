import { NextRequest, NextResponse } from 'next/server';
import { CloudflareR2Service } from '@/lib/r2-upload';
import { getUserUuid } from '@/services/user';

// 支持的文件类型
const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/mov',
  'video/quicktime',
  'video/webm',
  'video/avi',
  'video/x-msvideo'
];

const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/x-m4a',
  'audio/webm'
];

const ALL_SUPPORTED_TYPES = [...SUPPORTED_VIDEO_TYPES, ...SUPPORTED_AUDIO_TYPES];

// 最大文件大小 (500MB)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileType, fileSize, mode = 'video' } = body;

    // 验证参数
    if (!fileName || !fileType || !fileSize) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALL_SUPPORTED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Unsupported file type: ${fileType}` 
        },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        },
        { status: 400 }
      );
    }

    // 获取用户ID（可选）
    const userId = await getUserUuid();
    
    // 生成唯一的文件key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${mode}-uploads/${userId || 'anonymous'}/${timestamp}-${randomId}-${sanitizedFileName}`;

    // 初始化 R2 服务
    const r2Service = new CloudflareR2Service();
    
    // 生成预签名上传URL
    const presignedUrl = await r2Service.getPresignedUploadUrl(key, fileType, {
      expiresIn: 3600, // 1小时有效期
      metadata: {
        'original-name': fileName,
        'user-id': userId || 'anonymous',
        'upload-time': new Date().toISOString(),
        'mode': mode
      }
    });

    // 生成用于转录的公共URL
    const publicUrl = r2Service.getPublicUrl(key);
    
    // 生成预签名下载URL（用于Deepgram访问）
    const downloadUrl = await r2Service.getPresignedDownloadUrl(key, {
      expiresIn: 7200 // 2小时有效期，给转录足够的时间
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: presignedUrl,
        key: key,
        publicUrl: publicUrl,
        downloadUrl: downloadUrl, // 添加预签名下载URL
        expiresIn: 3600,
        maxFileSize: MAX_FILE_SIZE,
        fileType: fileType,
        fileName: fileName
      }
    });
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate upload URL' 
      },
      { status: 500 }
    );
  }
}