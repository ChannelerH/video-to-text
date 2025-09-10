/**
 * 分片上传工具类
 * 用于处理大文件的分片上传
 */

export interface UploadPart {
  PartNumber: number;
  ETag: string;
}

export interface MultipartUploadOptions {
  file: File;
  onProgress?: (percentage: number, uploadedBytes: number, totalBytes: number) => void;
  onPartComplete?: (partNumber: number, totalParts: number) => void;
  abortSignal?: AbortSignal;
}

export class MultipartUploader {
  private static readonly CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
  private static readonly MAX_CONCURRENT_UPLOADS = 3; // 最多3个并发上传
  private static readonly MIN_FILE_SIZE_FOR_MULTIPART = 50 * 1024 * 1024; // 50MB以上使用分片
  
  private uploadId: string | null = null;
  private key: string | null = null;
  private parts: UploadPart[] = [];
  private aborted = false;
  
  /**
   * 判断是否应该使用分片上传
   */
  static shouldUseMultipart(fileSize: number): boolean {
    return fileSize >= this.MIN_FILE_SIZE_FOR_MULTIPART;
  }
  
  /**
   * 执行分片上传
   */
  async upload(options: MultipartUploadOptions): Promise<any> {
    const { file, onProgress, onPartComplete, abortSignal } = options;
    
    // 监听中断信号
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        this.aborted = true;
      });
    }
    
    try {
      // 1. 初始化分片上传
      console.log(`[Multipart] Initializing upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      await this.initializeUpload(file);
      
      // 2. 计算分片
      const chunks = this.calculateChunks(file);
      const totalParts = chunks.length;
      
      console.log(`[Multipart] Uploading ${file.name} in ${totalParts} parts (${(MultipartUploader.CHUNK_SIZE / 1024 / 1024).toFixed(0)} MB each)`);
      
      // 3. 并发上传分片
      let uploadedBytes = 0;
      const uploadedParts: UploadPart[] = [];
      
      for (let i = 0; i < chunks.length; i += MultipartUploader.MAX_CONCURRENT_UPLOADS) {
        if (this.aborted) {
          throw new Error('Upload aborted');
        }
        
        // 准备这一批要上传的分片
        const batch = chunks.slice(i, i + MultipartUploader.MAX_CONCURRENT_UPLOADS);
        
        // 并发上传
        const batchPromises = batch.map(async (chunk) => {
          const partData = await this.uploadPart(
            chunk.partNumber,
            chunk.data,
            (progress) => {
              // 更新总进度
              const totalProgress = (uploadedBytes + progress) / file.size * 100;
              onProgress?.(totalProgress, uploadedBytes + progress, file.size);
            }
          );
          
          // 分片上传完成
          uploadedBytes += chunk.data.size;
          onPartComplete?.(chunk.partNumber, totalParts);
          
          return partData;
        });
        
        const batchResults = await Promise.all(batchPromises);
        uploadedParts.push(...batchResults);
        
        // 更新总进度
        onProgress?.(uploadedBytes / file.size * 100, uploadedBytes, file.size);
      }
      
      // 4. 完成上传
      this.parts = uploadedParts;
      console.log(`[Multipart] Completing upload with ${uploadedParts.length} parts`);
      const result = await this.completeUpload(file);
      
      console.log(`[Multipart] Upload completed for ${file.name}`, result);
      return result;
      
    } catch (error) {
      console.error('[Multipart] Upload failed:', error);
      // 如果上传失败，可以选择中止整个上传
      if (this.uploadId) {
        // TODO: 实现 abort multipart upload API
      }
      throw error;
    }
  }
  
  /**
   * 初始化分片上传
   */
  private async initializeUpload(file: File): Promise<void> {
    const response = await fetch('/api/upload/multipart/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to initialize multipart upload');
    }
    
    const result = await response.json();
    this.uploadId = result.data.uploadId;
    this.key = result.data.key;
  }
  
  /**
   * 计算文件分片
   */
  private calculateChunks(file: File): Array<{ partNumber: number; data: Blob }> {
    const chunks = [];
    const chunkSize = MultipartUploader.CHUNK_SIZE;
    
    for (let start = 0; start < file.size; start += chunkSize) {
      const end = Math.min(start + chunkSize, file.size);
      chunks.push({
        partNumber: Math.floor(start / chunkSize) + 1,
        data: file.slice(start, end)
      });
    }
    
    return chunks;
  }
  
  /**
   * 上传单个分片
   */
  private async uploadPart(
    partNumber: number, 
    data: Blob,
    onProgress?: (bytes: number) => void
  ): Promise<UploadPart> {
    // 1. 获取预签名URL
    const urlResponse = await fetch('/api/upload/multipart/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: this.uploadId,
        key: this.key,
        partNumber: partNumber,
        contentLength: data.size
      })
    });
    
    if (!urlResponse.ok) {
      throw new Error(`Failed to get presigned URL for part ${partNumber}`);
    }
    
    const { data: { url } } = await urlResponse.json();
    
    // 2. 上传分片到R2
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200 || xhr.status === 204) {
          // 从响应头获取ETag
          let etag = xhr.getResponseHeader('ETag');
          if (!etag) {
            // 如果没有ETag，生成一个假的（R2应该会返回）
            console.warn(`No ETag returned for part ${partNumber}, using placeholder`);
            etag = `"part-${partNumber}"`;
          }
          // 保留引号，AWS S3需要带引号的ETag
          resolve({
            PartNumber: partNumber,
            ETag: etag
          });
        } else {
          reject(new Error(`Failed to upload part ${partNumber}: Status ${xhr.status}`));
        }
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error(`Network error uploading part ${partNumber}`));
      });
      
      xhr.open('PUT', url);
      xhr.send(data);
    });
  }
  
  /**
   * 完成分片上传
   */
  private async completeUpload(file: File): Promise<any> {
    const response = await fetch('/api/upload/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: this.uploadId,
        key: this.key,
        parts: this.parts,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to complete multipart upload');
    }
    
    const result = await response.json();
    return result.data;
  }
}