import { NextRequest, NextResponse } from 'next/server';
import { CloudflareR2Service } from '@/lib/r2-upload';

// 配置API路由以支持大文件上传
export const runtime = 'nodejs';
export const maxDuration = 60; // 60秒超时

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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'video';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALL_SUPPORTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Unsupported file type: ${file.type}. Supported types: ${ALL_SUPPORTED_TYPES.join(', ')}` 
        },
        { status: 400 }
      );
    }

    // 根据模式验证文件类型
    const isVideoMode = mode === 'video';
    const expectedTypes = isVideoMode ? SUPPORTED_VIDEO_TYPES : SUPPORTED_AUDIO_TYPES;
    
    if (!expectedTypes.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File type ${file.type} is not supported in ${mode} mode` 
        },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        },
        { status: 400 }
      );
    }

    // 初始化 Cloudflare R2 服务
    const r2Service = new CloudflareR2Service();
    
    // 验证 R2 配置
    const configCheck = r2Service.validateConfig();
    if (!configCheck.isValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: `R2 configuration missing: ${configCheck.missing.join(', ')}` 
        },
        { status: 500 }
      );
    }

    // 将文件转换为 Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 基本的媒体文件头部验证
    if (buffer.length < 100) {
      return NextResponse.json(
        { success: false, error: 'File too small or corrupted' },
        { status: 400 }
      );
    }
    
    // 检查文件是否是纯文本（这不是有效的媒体文件）
    const firstBytes = buffer.slice(0, 50).toString('utf8');
    if (/^[\x20-\x7E\s]+$/.test(firstBytes)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid media file. Please upload a valid audio or video file.' 
        },
        { status: 400 }
      );
    }
    
    // 上传到 Cloudflare R2
    const uploadResult = await r2Service.uploadFile(
      buffer,
      file.name,
      file.type,
      {
        folder: `${mode}-uploads`, // video-uploads 或 audio-uploads
        expiresIn: 24, // 24小时后自动删除
        makePublic: true // 设为公开访问，以便 Replicate 可以访问
      }
    );

    // 返回文件信息
    const fileInfo = {
      originalName: file.name,
      r2Key: uploadResult.key,
      publicUrl: uploadResult.publicUrl,
      replicateUrl: uploadResult.url, // Replicate 使用的 URL
      fileSize: file.size,
      fileType: file.type,
      mode: mode,
      uploadedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24小时后过期
    };

    console.log(`File uploaded to R2: ${uploadResult.key} (${file.size} bytes)`);

    return NextResponse.json({
      success: true,
      data: fileInfo
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      },
      { status: 500 }
    );
  }
}

// 获取上传限制信息
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      maxFileSize: MAX_FILE_SIZE,
      maxFileSizeMB: MAX_FILE_SIZE / 1024 / 1024,
      supportedVideoTypes: SUPPORTED_VIDEO_TYPES,
      supportedAudioTypes: SUPPORTED_AUDIO_TYPES,
      allSupportedTypes: ALL_SUPPORTED_TYPES
    }
  });
}