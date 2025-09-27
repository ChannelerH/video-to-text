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
  // Add force path style for S3-compatible services like R2
  forcePathStyle: true,
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
    
    // 验证环境变量
    if (!process.env.STORAGE_BUCKET || !process.env.STORAGE_ACCESS_KEY || !process.env.STORAGE_SECRET_KEY) {
      console.error('[Multipart] Missing S3 configuration');
      return NextResponse.json(
        { success: false, error: 'Storage service not configured' },
        { status: 500 }
      );
    }
    
    // 获取用户ID
    const userId = await getUserUuid();
    
    // 生成唯一的文件key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `multipart-uploads/${userId || 'anonymous'}/${timestamp}-${randomId}-${sanitizedFileName}`;
    
    console.log('[Multipart] Initializing upload:', {
      bucket: process.env.STORAGE_BUCKET,
      key: key,
      fileType: fileType,
      fileSize: fileSize
    });
    
    // 初始化分片上传
    // S3 metadata 只支持 ASCII 字符，需要对文件名进行编码
    const baseCommand = new CreateMultipartUploadCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: key,
      ContentType: fileType,
      Metadata: {
        'original-name': encodeURIComponent(fileName),
        'user-id': userId || 'anonymous',
        'upload-time': new Date().toISOString(),
        'file-size': fileSize.toString(),
        'upload-method': 'multipart'
      }
    });

    let response;
    try {
      response = await s3Client.send(baseCommand);
    } catch (err: any) {
      if (err?.Code === 'InternalError') {
        console.warn('[Multipart] Metadata init failed, retrying without metadata');
        const fallbackCommand = new CreateMultipartUploadCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: key,
          ContentType: fileType
        });
        response = await s3Client.send(fallbackCommand);
      } else {
        throw err;
      }
    }
    
    console.log(`[Multipart] Initialized upload for ${fileName}, UploadId: ${response.UploadId}`);
    
    return NextResponse.json({
      success: true,
      data: {
        uploadId: response.UploadId,
        key: key
      }
    });
  } catch (error: any) {
    console.error('Multipart init error:', error);
    
    // Provide more detailed error information
    const errorMessage = error?.$metadata?.httpStatusCode === 403 
      ? 'Access denied. Check S3 credentials and bucket permissions.'
      : error?.Code === 'NoSuchBucket'
      ? 'Storage bucket does not exist.'
      : error?.Code === 'InternalError'
      ? 'S3 service internal error. This is usually temporary - please try again.'
      : error instanceof Error 
      ? error.message 
      : 'Failed to initialize multipart upload';
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          code: error?.Code,
          statusCode: error?.$metadata?.httpStatusCode,
          requestId: error?.$metadata?.requestId
        } : undefined
      },
      { status: error?.$metadata?.httpStatusCode || 500 }
    );
  }
}
