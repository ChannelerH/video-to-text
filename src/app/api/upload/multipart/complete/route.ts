import { NextRequest, NextResponse } from 'next/server';
import { S3Client, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { CloudflareR2Service } from '@/lib/r2-upload';

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
    const { uploadId, key, parts, fileName, fileType, fileSize } = await request.json();
    
    // 验证参数
    if (!uploadId || !key || !parts || !Array.isArray(parts)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 确保parts按PartNumber排序
    const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);
    
    // 完成分片上传
    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.STORAGE_BUCKET || '',
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts
      }
    });
    
    const response = await s3Client.send(command);
    
    console.log(`[Multipart] Completed upload for ${fileName}, Location: ${response.Location}`);
    
    // 生成访问URL
    const r2Service = new CloudflareR2Service();
    const publicUrl = r2Service.getPublicUrl(key);
    const downloadUrl = await r2Service.getPresignedDownloadUrl(key, {
      expiresIn: 7200 // 2小时有效期
    });
    
    console.log(`[Multipart] Generated download URL for Deepgram:`, downloadUrl.substring(0, 100) + '...');
    
    return NextResponse.json({
      success: true,
      data: {
        key: key,
        location: response.Location,
        etag: response.ETag,
        publicUrl: publicUrl,
        replicateUrl: downloadUrl, // 给Deepgram用的预签名URL
        originalName: fileName,
        fileType: fileType,
        fileSize: fileSize,
        uploadMethod: 'multipart'
      }
    });
  } catch (error) {
    console.error('Multipart complete error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to complete multipart upload' 
      },
      { status: 500 }
    );
  }
}