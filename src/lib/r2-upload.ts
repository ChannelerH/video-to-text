import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2UploadResult {
  key: string;
  url: string;
  publicUrl: string;
  deleteUrl?: string;
}

export class CloudflareR2Service {
  private s3Client: S3Client;
  private bucketName: string;
  private accountId: string;
  private publicDomain?: string;

  constructor() {
    // 使用新的 STORAGE_ 环境变量
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
    this.bucketName = process.env.STORAGE_BUCKET || '';
    this.publicDomain = process.env.STORAGE_DOMAIN || process.env.CLOUDFLARE_R2_PUBLIC_DOMAIN;
    
    // 使用 STORAGE_ 配置的 S3 兼容端点
    this.s3Client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      endpoint: process.env.STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
      },
    });
  }

  /**
   * 上传文件到 Cloudflare R2
   */
  async uploadFile(
    file: Buffer, 
    fileName: string, 
    contentType: string,
    options: {
      folder?: string;
      expiresIn?: number; // 文件自动删除时间(小时)
      makePublic?: boolean; // 是否设为公开访问
    } = {}
  ): Promise<R2UploadResult> {
    try {
      const { folder = 'uploads', expiresIn = 24, makePublic = true } = options;
      
      // 生成唯一的文件键
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const key = `${folder}/${timestamp}_${randomId}_${fileName}`;

      // 设置元数据，包含过期时间
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + expiresIn);

      const putObjectCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
        ContentLength: file.length,
        Metadata: {
          'upload-time': new Date().toISOString(),
          'expires-at': expiryDate.toISOString(),
          'auto-delete': 'true'
        },
        // R2 不支持 Expires，我们使用元数据记录过期时间
      });

      await this.s3Client.send(putObjectCommand);

      // 生成公网可访问的 URL
      let publicUrl: string;
      if (this.publicDomain) {
        // 使用自定义域名（检查是否已包含协议）
        const domain = this.publicDomain.startsWith('http') ? this.publicDomain : `https://${this.publicDomain}`;
        publicUrl = `${domain}/${key}`;
      } else {
        // 使用默认的 R2.dev 域名（需要在 R2 控制台启用）
        publicUrl = `https://pub-${this.bucketName}.r2.dev/${key}`;
      }
      
      // 生成预签名 URL (用于临时访问，适合 Replicate)
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, getObjectCommand, {
        expiresIn: expiresIn * 3600, // 转换为秒
      });

      console.log(`File uploaded to Cloudflare R2: ${key}`);
      
      return {
        key,
        url: signedUrl, // Replicate 使用这个 URL
        publicUrl, // 公开访问的 URL
      };
    } catch (error) {
      console.error('Cloudflare R2 upload error:', error);
      throw new Error(`Failed to upload file to R2: ${error}`);
    }
  }

  /**
   * 删除 R2 文件
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const deleteObjectCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(deleteObjectCommand);
      console.log(`File deleted from Cloudflare R2: ${key}`);
    } catch (error) {
      console.error('Cloudflare R2 delete error:', error);
      throw new Error(`Failed to delete file from R2: ${error}`);
    }
  }

  /**
   * 批量删除过期文件
   */
  async cleanupExpiredFiles(): Promise<number> {
    // 这里可以实现定期清理逻辑
    // R2 目前不支持生命周期规则，需要手动清理
    console.log('Cleanup task - manual cleanup for Cloudflare R2');
    
    // 实现逻辑：扫描文件，检查元数据中的过期时间
    // 删除过期的文件
    let deletedCount = 0;
    // TODO: 实现扫描和清理逻辑
    
    return deletedCount;
  }

  /**
   * 验证 Cloudflare R2 配置
   */
  validateConfig(): { isValid: boolean; missing: string[] } {
    const required = [
      'STORAGE_ENDPOINT',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY', 
      'STORAGE_BUCKET'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    
    return {
      isValid: missing.length === 0,
      missing
    };
  }

  /**
   * 获取文件的公开访问 URL
   */
  getPublicUrl(key: string): string {
    if (this.publicDomain) {
      return `https://${this.publicDomain}/${key}`;
    } else {
      // 如果没有自定义域名，使用默认的 R2.dev 域名
      return `https://pub-${this.bucketName}.r2.dev/${key}`;
    }
  }

  /**
   * 生成预签名上传URL，允许客户端直接上传到R2
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    options: {
      expiresIn?: number; // 秒
      metadata?: Record<string, string>;
    } = {}
  ): Promise<string> {
    const { expiresIn = 3600, metadata = {} } = options;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
      Metadata: {
        ...metadata,
        'upload-method': 'presigned-url',
        'upload-time': new Date().toISOString()
      }
    });

    // 生成预签名URL
    const presignedUrl = await getSignedUrl(this.s3Client, command, { 
      expiresIn,
      signableHeaders: new Set(['content-type']) // 确保content-type必须匹配
    });

    return presignedUrl;
  }

  /**
   * 生成预签名下载URL
   */
  async getPresignedDownloadUrl(
    key: string,
    options: {
      expiresIn?: number; // 秒
      responseContentDisposition?: string;
    } = {}
  ): Promise<string> {
    const { expiresIn = 3600, responseContentDisposition } = options;
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: responseContentDisposition
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, { 
      expiresIn 
    });

    return presignedUrl;
  }
}