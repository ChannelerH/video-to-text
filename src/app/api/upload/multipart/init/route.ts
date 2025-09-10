import { NextRequest, NextResponse } from 'next/server';
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getUserUuid } from '@/services/user';

// 初始化S3客户端
const s3Client = new S3Client({
  region: process.env.STORAGE_REGION || 'auto',
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
  },
});

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileType, fileSize } = await request.json();
    
    // 验证参数
    if (!fileName || !fileType || !fileSize) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 获取用户ID
    const userId = await getUserUuid();
    
    // 生成唯一的文件key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `multipart-uploads/${userId || 'anonymous'}/${timestamp}-${randomId}-${sanitizedFileName}`;
    
    // 初始化分片上传
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.STORAGE_BUCKET || '',
      Key: key,
      ContentType: fileType,
      Metadata: {
        'original-name': fileName,
        'user-id': userId || 'anonymous',
        'upload-time': new Date().toISOString(),
        'file-size': fileSize.toString(),
        'upload-method': 'multipart'
      }
    });
    
    const response = await s3Client.send(command);
    
    console.log(`[Multipart] Initialized upload for ${fileName}, UploadId: ${response.UploadId}`);
    
    return NextResponse.json({
      success: true,
      data: {
        uploadId: response.UploadId,
        key: key
      }
    });
  } catch (error) {
    console.error('Multipart init error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to initialize multipart upload' 
      },
      { status: 500 }
    );
  }
}