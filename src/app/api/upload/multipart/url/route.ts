import { NextRequest, NextResponse } from 'next/server';
import { S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
    const { uploadId, key, partNumber, contentLength } = await request.json();
    
    // 验证参数
    if (!uploadId || !key || !partNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 生成分片上传的预签名URL
    const command = new UploadPartCommand({
      Bucket: process.env.STORAGE_BUCKET || '',
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: contentLength
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1小时有效期
    });
    
    console.log(`[Multipart] Generated presigned URL for part ${partNumber}`);
    
    return NextResponse.json({
      success: true,
      data: {
        url: presignedUrl,
        partNumber: partNumber
      }
    });
  } catch (error) {
    console.error('Multipart URL generation error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate part URL' 
      },
      { status: 500 }
    );
  }
}