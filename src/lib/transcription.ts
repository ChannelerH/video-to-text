import { YouTubeService, VideoInfo, DownloadOptions, DownloadProgress } from './youtube';
import { TranscriptionResult } from './replicate';
import { UnifiedTranscriptionService } from './unified-transcription';
import { transcriptionCache, CacheEntry } from './cache';
import { CloudflareR2Service } from './r2-upload';
import crypto from 'crypto';

export interface TranscriptionRequest {
  type: 'youtube_url' | 'file_upload' | 'audio_url';
  content: string; // URL 或 文件路径
  options?: {
    language?: string;
    userId?: string;
    userTier?: string;
    isPreview?: boolean; // 是否为预览请求
    fallbackEnabled?: boolean; // 是否启用降级
    highAccuracyMode?: boolean; // Pro用户高准确度模式
    outputFormat?: 'json' | 'srt'; // Deepgram输出格式
    formats?: string[]; // ['txt', 'srt', 'vtt', 'json', 'md']
    r2Key?: string; // 对于文件上传，传入 R2 对象键用于稳定缓存
    downloadOptions?: DownloadOptions; // YouTube 下载优化选项
    onDownloadProgress?: (progress: DownloadProgress) => void; // 下载进度回调
    languageProbeSeconds?: number; // 语言探针秒数（前端可传 8-12）
    forceChinese?: boolean; // 前端探针结果强制中文
  };
}

export interface TranscriptionResponse {
  success: boolean;
  data?: {
    transcription: TranscriptionResult;
    formats: Record<string, string>;
    videoInfo?: VideoInfo;
    fromCache: boolean;
    estimatedCost?: number;
  };
  error?: string;
  preview?: {
    text: string;
    srt: string;
    duration: number; // 预览时长（秒）
  };
}

export class TranscriptionService {
  private transcriptionService: UnifiedTranscriptionService;
  private r2Service: CloudflareR2Service;

  constructor(replicateApiToken: string, deepgramApiKey?: string) {
    this.transcriptionService = new UnifiedTranscriptionService(replicateApiToken, deepgramApiKey);
    this.r2Service = new CloudflareR2Service();
  }

  /**
   * 主要的转录处理函数
   */
  async processTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      if (request.type === 'youtube_url') {
        return await this.processYouTubeTranscription(request);
      } else if (request.type === 'audio_url') {
        return await this.processAudioUrlTranscription(request);
      } else {
        return await this.processFileTranscription(request);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * 处理 YouTube URL 转录
   */
  private async processYouTubeTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const url = request.content;
    
    // 1. 验证和解析 YouTube URL
    const videoId = YouTubeService.validateAndParseUrl(url);
    if (!videoId) {
      return {
        success: false,
        error: 'Invalid YouTube URL'
      };
    }

    console.log(`Processing YouTube video: ${videoId}`);

    // 2. 检查缓存
    const cachedEntry = await transcriptionCache.get('youtube', videoId);
    if (cachedEntry) {
      console.log(`Cache hit for YouTube video: ${videoId}`);
      return {
        success: true,
        data: {
          transcription: cachedEntry.transcriptionData,
          formats: cachedEntry.formats,
          videoInfo: {
            videoId,
            title: cachedEntry.videoTitle || '',
            duration: cachedEntry.duration,
            thumbnails: []
          },
          fromCache: true
        }
      };
    }

    // 3. 获取视频信息
    let videoInfo: VideoInfo;
    try {
      videoInfo = await YouTubeService.getVideoInfo(videoId);
    } catch (error) {
      return {
        success: false,
        error: 'Failed to access video. It might be private, age-restricted, or unavailable in your region.'
      };
    }

    console.log(`Video info: ${videoInfo.title} (${videoInfo.duration}s)`);

    // 4. 检查是否有现有字幕
    if (videoInfo.captions && videoInfo.captions.length > 0) {
      console.log(`Found ${videoInfo.captions.length} caption tracks`);
      return await this.processYouTubeCaptions(videoInfo, request);
    }

    // 5. 如果没有字幕，进行音频转录
    console.log('No captions found, proceeding with audio transcription');
    return await this.processYouTubeAudioTranscription(videoInfo, request);
  }

  /**
   * 处理 YouTube 现有字幕
   */
  private async processYouTubeCaptions(videoInfo: VideoInfo, request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      const bestCaption = YouTubeService.selectBestCaption(
        videoInfo.captions!,
        request.options?.language ? [request.options.language] : ['en', 'en-US']
      );

      if (!bestCaption) {
        return await this.processYouTubeAudioTranscription(videoInfo, request);
      }

      console.log(`Using caption: ${bestCaption.name} (${bestCaption.languageCode})`);

      // 下载字幕
      const captionText = await YouTubeService.downloadCaption(bestCaption.url);
      const captionSRT = await YouTubeService.convertCaptionToSRT(bestCaption.url);

      // 构造转录结果
      const transcription: TranscriptionResult = {
        text: captionText,
        segments: [], // YouTube字幕不提供segment信息
        language: bestCaption.languageCode,
        duration: videoInfo.duration
      };

      // 生成不同格式
      const formats = await this.generateFormats(transcription, videoInfo.title);
      formats.srt = captionSRT; // 使用 YouTube 原生的 SRT

      // 缓存结果
      await transcriptionCache.set(
        'youtube',
        videoInfo.videoId,
        transcription,
        formats,
        {
          originalUrl: request.content,
          videoTitle: videoInfo.title,
          userTier: request.options?.userTier
        },
        { userId: request.options?.userId }
      );

      let jobId = crypto.randomUUID();

      // 写入数据库（仅登录用户）
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          const row = await createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'youtube_url',
            source_hash: videoInfo.videoId,
            source_url: request.content,
            title: videoInfo.title,
            language: transcription.language,
            duration_sec: videoInfo.duration,
            cost_minutes: Math.ceil(videoInfo.duration/60),
            status: 'completed'
          });
          jobId = (row as any).job_id || jobId;
          await upsertTranscriptionFormats(jobId, formats);
        } catch (e) {
          console.warn('DB write skipped:', e);
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          videoInfo,
          fromCache: false,
          estimatedCost: 0 // 使用现有字幕无成本
        }
      };
    } catch (error) {
      console.error('Caption processing failed, falling back to audio transcription:', error);
      return await this.processYouTubeAudioTranscription(videoInfo, request);
    }
  }

  /**
   * 处理 YouTube 音频转录（优化版）
   */
  private async processYouTubeAudioTranscription(videoInfo: VideoInfo, request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      // 估算成本
      const estimatedCost = this.transcriptionService.estimateCost(videoInfo.duration);
      console.log(`Estimated transcription cost: $${estimatedCost.toFixed(4)}`);

      // 首先检查视频是否适合优化下载（带重试）
      let optimizationInfo;
      try {
        optimizationInfo = await YouTubeService.isVideoOptimizedForFastDownload(videoInfo.videoId);
        console.log('Video optimization status:', {
          isOptimized: optimizationInfo.isOptimized,
          reasons: optimizationInfo.reasons?.slice(0, 2), // 只显示前2个原因
          recommendations: optimizationInfo.recommendations?.slice(0, 2)
        });
      } catch (error: any) {
        console.warn('Failed to check optimization status after retries:', error.message);
        // 在无法检查优化状态时，默认尝试优化下载
        optimizationInfo = { 
          isOptimized: true, // 乐观尝试
          reasons: ['Could not analyze due to network issues'], 
          recommendations: ['Will attempt optimized download anyway'] 
        };
      }

      // 获取音频格式信息以便估算下载时间（带重试）
      let formatInfo;
      try {
        formatInfo = await YouTubeService.getAudioFormatInfo(videoInfo.videoId);
        console.log('Audio format info:', {
          estimatedDownloadTime: `${formatInfo.estimatedDownloadTime}s`,
          supportsParallelDownload: formatInfo.supportsParallelDownload,
          filesize: formatInfo.selectedFormat?.contentLength ? 
            `${Math.round(formatInfo.selectedFormat.contentLength / 1024 / 1024 * 100) / 100}MB` : 'unknown'
        });
      } catch (error: any) {
        console.warn('Failed to get audio format info after retries:', error.message);
        // 在无法获取格式信息时，使用默认值
        formatInfo = {
          selectedFormat: null,
          estimatedDownloadTime: 30, // 保守估计
          supportsParallelDownload: true
        };
      }

      // 设置优化的下载选项
      const downloadOptions = this.createOptimizedDownloadOptions(request, videoInfo.duration);

      let audioBuffer: Buffer;
      let downloadMethod = 'optimized';
      let downloadAttempts = 0;
      const maxAttempts = 3;

      // 带重试的下载逻辑
      while (downloadAttempts < maxAttempts) {
        downloadAttempts++;
        
        try {
          // 尝试使用优化的并行下载（如果视频支持）
          if (optimizationInfo?.isOptimized || downloadAttempts === 1) {
            console.log(`Attempt ${downloadAttempts}: Starting optimized YouTube audio download...`);
            
            // 增强的下载选项，包含进度和错误回调
            const enhancedOptions = {
              ...downloadOptions,
              onProgress: (progress: DownloadProgress) => {
                if (request.options?.onDownloadProgress) {
                  request.options.onDownloadProgress(progress);
                }
                // 每10%记录一次进度
                if (progress.percentage && progress.percentage % 10 === 0) {
                  const speedMB = Math.round((progress.speed || 0) / 1024 / 1024 * 100) / 100;
                  console.log(`Download progress: ${progress.percentage}% at ${speedMB}MB/s`);
                }
              },
              onError: (error: Error) => {
                console.error(`Download error (attempt ${downloadAttempts}):`, error.message);
              }
            };
            
            audioBuffer = await YouTubeService.downloadAudioStreamOptimized(
              videoInfo.videoId,
              enhancedOptions
            );
            console.log(`Optimized download completed: ${audioBuffer.length} bytes`);
            break; // 成功，退出循环
          } else {
            throw new Error('Video not optimized for parallel download, skipping to fallback');
          }
        } catch (optimizedError) {
          console.warn(`Optimized download failed (attempt ${downloadAttempts}):`, optimizedError);
          
          // 如果还有重试机会，等待后重试
          if (downloadAttempts < maxAttempts) {
            const retryDelay = Math.min(1000 * Math.pow(2, downloadAttempts - 1), 5000); // 指数退避
            console.log(`Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // 尝试 ytdl-core 流式下载作为降级方案
          try {
            console.log('Falling back to ytdl-core streaming...');
            downloadMethod = 'ytdl-stream';
            
            const streamOptions = {
              ...downloadOptions,
              timeout: 120000, // 增加超时时间
              retryAttempts: 1,
              onProgress: request.options?.onDownloadProgress
            };
            
            audioBuffer = await YouTubeService.downloadAudioWithYtdlStream(
              videoInfo.videoId,
              streamOptions
            );
            console.log(`ytdl-core stream download completed: ${audioBuffer.length} bytes`);
            break;
          } catch (streamError) {
            console.warn('Stream download failed:', streamError);
            
            // 最终降级到传统方法（带重试）
            try {
              console.log('Using legacy download method as final fallback...');
              downloadMethod = 'legacy';
              
              // 使用改进的 getAudioStreamUrl 方法（带重试）
              const audioStreamUrl = await YouTubeService.getAudioStreamUrl(videoInfo.videoId);
              
              // 带超时和重试的 fetch
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 120000); // 增加超时时间到120秒
              
              console.log('Fetching audio from stream URL...');
              const audioResponse = await fetch(audioStreamUrl, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Accept': '*/*',
                  'Accept-Encoding': 'gzip, deflate, br'
                }
              });
              clearTimeout(timeout);
              
              if (!audioResponse.ok) {
                throw new Error(`Legacy download failed: ${audioResponse.status} ${audioResponse.statusText}`);
              }
              
              const contentLength = audioResponse.headers.get('content-length');
              console.log(`Legacy download starting: ${contentLength ? Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100 + 'MB' : 'unknown size'}`);
              
              audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
              console.log(`Legacy download completed: ${Math.round(audioBuffer.length / 1024 / 1024 * 100) / 100}MB`);
              break;
            } catch (legacyError: any) {
              console.error(`Legacy download failed (attempt ${downloadAttempts}):`, legacyError.message);
              if (downloadAttempts >= maxAttempts) {
                throw new Error(`All download methods failed after ${downloadAttempts} attempts. Last error: ${legacyError.message}`);
              }
            }
          }
        }
      }

      // 确保我们有音频数据
      if (!audioBuffer!) {
        throw new Error('Failed to download audio after all attempts');
      }

      // 生成临时文件名，包含下载方法信息用于调试
      const audioFileName = `youtube_${videoInfo.videoId}_${downloadMethod}_${Date.now()}.m4a`;
      
      // 上传音频到 Cloudflare R2
      console.log('Uploading audio to Cloudflare R2...');
      const uploadResult = await this.r2Service.uploadFile(
        audioBuffer,
        audioFileName,
        'audio/mp4', // YouTube 音频流通常是 M4A/MP4 格式
        {
          folder: 'youtube-audio',
          expiresIn: 2, // 2小时后自动删除
          makePublic: true
        }
      );
      console.log(`Audio uploaded to R2: ${uploadResult.key} (${Math.round(audioBuffer.length / 1024 / 1024)}MB)`);

      // 使用 R2 URL 进行转录
      console.log('Starting Replicate transcription with R2 URL...');
      const transcription = await this.transcriptionService.transcribeAudio(uploadResult.url, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      });

      // 生成不同格式
      const formats = await this.generateFormats(transcription, videoInfo.title);

      // 缓存结果
      await transcriptionCache.set(
        'youtube',
        videoInfo.videoId,
        transcription,
        formats,
        {
          originalUrl: request.content,
          videoTitle: videoInfo.title,
          userTier: request.options?.userTier,
          r2Key: uploadResult.key // 保存 R2 key 用于后续清理
        },
        { userId: request.options?.userId }
      );

      // 记录下载方法用于分析（通过日志）
      console.log(`Transcription cached with download method: ${downloadMethod}`);

      // 异步清理 R2 文件（不等待完成）
      setTimeout(async () => {
        try {
          await this.r2Service.deleteFile(uploadResult.key);
          console.log(`Cleaned up temporary audio file: ${uploadResult.key}`);
        } catch (error) {
          console.error('Failed to cleanup temporary audio file:', error);
        }
      }, 60000); // 1分钟后清理

      // 写入数据库（仅登录用户）
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          let jobId = crypto.randomUUID();
          const row = await createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'youtube_url',
            source_hash: videoInfo.videoId,
            source_url: request.content,
            title: videoInfo.title,
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          });
          jobId = (row as any).job_id || jobId;
          await upsertTranscriptionFormats(jobId, formats);
        } catch (e) {
          console.warn('DB write skipped:', e);
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          videoInfo,
          fromCache: false,
          estimatedCost
        }
      };
    } catch (error) {
      console.error('YouTube audio transcription failed:', error);
      return {
        success: false,
        error: `Audio transcription failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 处理通用音频链接转录
   */
  private async processAudioUrlTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const url = request.content;
    
    try {
      console.log(`Processing audio URL: ${url}`);
      
      // 1. 检测音频链接有效性和类型
      const audioInfo = await this.detectAudioUrl(url);
      if (!audioInfo.isValid) {
        return {
          success: false,
          error: audioInfo.error || 'Invalid audio URL'
        };
      }

      console.log(`Audio detected: ${audioInfo.contentType}, ${audioInfo.sizeInfo}`);

      // 2. 检查缓存（基于 URL hash）
      const urlHash = crypto.createHash('sha256').update(url).digest('hex');
      const cached = await transcriptionCache.get('audio_url', urlHash);
      
      if (cached) {
        console.log('Audio transcription found in cache');
        return {
          success: true,
          data: {
            transcription: cached.transcriptionData,
            formats: cached.formats || {},
            fromCache: true,
            estimatedCost: this.transcriptionService.estimateCost(cached.duration || 60)
          }
        };
      }

      // 3. 下载音频文件
      console.log('Downloading audio file...');
      const audioBuffer = await this.downloadAudioFromUrl(url, audioInfo);
      console.log(`Audio downloaded: ${Math.round(audioBuffer.length / 1024 / 1024 * 100) / 100}MB`);

      // 4. 上传到 R2
      const fileExtension = this.getFileExtensionFromContentType(audioInfo.contentType || 'audio/mpeg');
      const audioFileName = `audio_${Date.now()}.${fileExtension}`;
      
      console.log('Uploading audio to R2...');
      const uploadResult = await this.r2Service.uploadFile(
        audioBuffer,
        audioFileName,
        audioInfo.contentType || 'audio/mpeg',
        {
          folder: 'audio-urls',
          expiresIn: 2, // 2小时后自动删除
          makePublic: true
        }
      );
      console.log(`Audio uploaded to R2: ${uploadResult.key} (${Math.round(audioBuffer.length / 1024 / 1024)}MB)`);

      // 5. 使用 R2 URL 进行转录
      console.log('Starting Replicate transcription with R2 URL...');
      const transcription = await this.transcriptionService.transcribeAudio(uploadResult.url, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      });

      // 6. 生成不同格式
      const formats = await this.generateFormats(transcription, audioInfo.filename || 'audio');

      // 7. 缓存结果
      await transcriptionCache.set(
        'audio_url',
        urlHash,
        transcription,
        formats,
        {
          originalUrl: url,
          audioInfo: {
            contentType: audioInfo.contentType,
            fileSize: audioBuffer.length,
            duration: transcription.segments?.length ? 
              Math.max(...transcription.segments.map((s: any) => s.end)) : 60
          },
          userTier: request.options?.userTier,
          r2Key: uploadResult.key
        },
        { userId: request.options?.userId }
      );

      // 8. 异步清理 R2 文件
      setTimeout(async () => {
        try {
          await this.r2Service.deleteFile(uploadResult.key);
          console.log(`Cleaned up temporary audio file: ${uploadResult.key}`);
        } catch (error) {
          console.error('Failed to cleanup temporary audio file:', error);
        }
      }, 60000); // 1分钟后清理

      const estimatedCost = this.transcriptionService.estimateCost(
        transcription.segments?.length ? 
          Math.max(...transcription.segments.map((s: any) => s.end)) : 60
      );

      // 8. 写入数据库（仅登录用户）
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          let jobId = crypto.randomUUID();
          const row = await createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'audio_url',
            source_hash: urlHash,
            source_url: url,
            title: audioInfo.filename,
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          });
          jobId = (row as any).job_id || jobId;
          await upsertTranscriptionFormats(jobId, formats);
        } catch (e) {
          console.warn('DB write skipped:', e);
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          fromCache: false,
          estimatedCost
        }
      };

    } catch (error) {
      console.error('Audio URL transcription error:', error);
      return {
        success: false,
        error: `Audio transcription failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 检测音频URL的有效性和类型
   */
  private async detectAudioUrl(url: string): Promise<{
    isValid: boolean;
    contentType?: string;
    contentLength?: number;
    sizeInfo?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      // 验证 URL 格式
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS URLs are supported'
        };
      }

      // 发送 HEAD 请求检查文件信息
      console.log('Checking audio URL headers...');
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'audio/*,*/*;q=0.1'
        },
        signal: AbortSignal.timeout(10000) // 10秒超时
      });

      if (!response.ok) {
        return {
          isValid: false,
          error: `Unable to access URL: ${response.status} ${response.statusText}`
        };
      }

      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');

      // 检查内容类型
      const supportedTypes = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
        'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/mp4',
        'audio/flac', 'audio/x-flac'
      ];

      const isAudioType = supportedTypes.some(type => 
        contentType.toLowerCase().includes(type.split('/')[1])
      );

      if (!isAudioType && !contentType.includes('octet-stream')) {
        return {
          isValid: false,
          error: `Unsupported content type: ${contentType}. Supported: MP3, WAV, OGG, AAC, M4A, FLAC`
        };
      }

      // 检查文件大小
      const fileSizeMB = contentLength ? parseInt(contentLength) / 1024 / 1024 : 0;
      if (fileSizeMB > 100) { // 限制100MB
        return {
          isValid: false,
          error: `File too large: ${fileSizeMB.toFixed(1)}MB. Maximum allowed: 100MB`
        };
      }

      // 从URL提取文件名
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'audio';

      return {
        isValid: true,
        contentType: contentType || 'audio/mpeg',
        contentLength: contentLength ? parseInt(contentLength) : undefined,
        sizeInfo: fileSizeMB > 0 ? `${fileSizeMB.toFixed(1)}MB` : 'unknown size',
        filename: filename.includes('.') ? filename : 'audio.mp3'
      };

    } catch (error: any) {
      console.error('Error detecting audio URL:', error);
      
      if (error.name === 'AbortError') {
        return {
          isValid: false,
          error: 'URL check timeout. Please ensure the URL is accessible.'
        };
      }
      
      return {
        isValid: false,
        error: `Failed to check URL: ${error.message}`
      };
    }
  }

  /**
   * 下载音频文件
   */
  private async downloadAudioFromUrl(url: string, _audioInfo: any): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5分钟超时

    try {
      console.log('Starting audio download...');
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'audio/*,*/*;q=0.1'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      
      // 验证下载的文件不为空
      if (audioBuffer.length === 0) {
        throw new Error('Downloaded file is empty');
      }

      // 验证文件大小不超过限制
      const sizeMB = audioBuffer.length / 1024 / 1024;
      if (sizeMB > 100) {
        throw new Error(`Downloaded file too large: ${sizeMB.toFixed(1)}MB`);
      }

      return audioBuffer;

    } catch (error: any) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        throw new Error('Audio download timeout. File may be too large or connection is slow.');
      }
      
      throw error;
    }
  }

  /**
   * 根据内容类型获取文件扩展名
   */
  private getFileExtensionFromContentType(contentType: string): string {
    const typeMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac'
    };

    const lowerType = contentType.toLowerCase();
    for (const [mimeType, extension] of Object.entries(typeMap)) {
      if (lowerType.includes(mimeType)) {
        return extension;
      }
    }

    return 'mp3'; // 默认
  }

  /**
   * 创建优化的下载配置
   */
  private createOptimizedDownloadOptions(
    request: TranscriptionRequest,
    videoDuration: number
  ): DownloadOptions {
    const userTier = request.options?.userTier || 'pro';
    
    // 基础选项，包含 CDN 代理支持
    const baseOptions: DownloadOptions = {
      enableParallelDownload: true,
      timeout: 90000,
      retryAttempts: 1,
      retryDelay: 1000,
      cdnProxy: process.env.YOUTUBE_CDN_PROXY, // 使用 CDN 代理（如果配置了）
      onProgress: request.options?.onDownloadProgress || ((progress: DownloadProgress) => {
        const speedMBps = Math.round(progress.speed / 1024 / 1024 * 100) / 100;
        const eta = progress.eta ? `${Math.round(progress.eta)}s` : 'N/A';
        const chunkInfo = progress.totalChunks ? 
          ` (chunk ${progress.chunkIndex}/${progress.totalChunks})` : '';
        console.log(`Download: ${progress.percentage || 'N/A'}% at ${speedMBps}MB/s, ETA: ${eta}${chunkInfo}`);
      }),
      onError: (error: Error) => {
        console.error('Download error:', error.message);
      }
    };

    // 根据用户等级和视频时长调整下载策略
    if (userTier === 'premium') {
      // 高级用户：最激进的优化设置
      return {
        ...baseOptions,
        chunkSize: 2 * 1024 * 1024, // 2MB chunks for faster download
        maxConcurrentChunks: 8, // Maximum parallel connections
        timeout: 180000, // 3 minutes timeout for stability
        retryAttempts: 1,
        retryDelay: 500, // Shorter retry delay
        ...request.options?.downloadOptions
      };
    } else if (userTier === 'pro') {
      // 专业用户：高性能设置
      return {
        ...baseOptions,
        chunkSize: 1.5 * 1024 * 1024, // 1.5MB chunks
        maxConcurrentChunks: 6,
        timeout: 150000,
        retryAttempts: 1,
        retryDelay: 750,
        ...request.options?.downloadOptions
      };
    } else if (videoDuration > 3600) {
      // 超过1小时的长视频：优化大文件下载
      return {
        ...baseOptions,
        chunkSize: 2 * 1024 * 1024, // Larger chunks for efficiency
        maxConcurrentChunks: 6, // Balanced parallel connections
        timeout: 180000, // Extended timeout
        retryAttempts: 1,
        retryDelay: 1000,
        ...request.options?.downloadOptions
      };
    } else if (videoDuration > 1800) {
      // 30-60分钟的中等视频：平衡设置
      return {
        ...baseOptions,
        chunkSize: 1.5 * 1024 * 1024,
        maxConcurrentChunks: 5,
        timeout: 120000,
        retryAttempts: 1,
        retryDelay: 1000,
        ...request.options?.downloadOptions
      };
    } else if (videoDuration > 600) {
      // 10-30分钟的视频：标准优化
      return {
        ...baseOptions,
        chunkSize: 1024 * 1024, // 1MB chunks
        maxConcurrentChunks: 4,
        timeout: 90000,
        retryAttempts: 1,
        retryDelay: 1000,
        ...request.options?.downloadOptions
      };
    } else {
      // 短视频（<10分钟）：轻量级设置
      return {
        ...baseOptions,
        chunkSize: 512 * 1024, // 512KB chunks for quick start
        maxConcurrentChunks: 3, // Fewer connections for small files
        timeout: 60000,
        retryAttempts: 1,
        retryDelay: 1000,
        ...request.options?.downloadOptions
      };
    }
  }

  /**
   * 处理文件上传转录
   */
  private async processFileTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const filePath = request.content;
    // 生成稳定的缓存键：优先使用 R2 对象键；否则使用去除查询参数后的 URL 作为键
    const fileHash = this.deriveCacheKeyForFile(filePath, request.options?.r2Key);
    
    // 检查缓存
    const cachedEntry = await transcriptionCache.get('user_file', fileHash, request.options?.userId);
    if (cachedEntry) {
      console.log(`Cache hit for file: ${fileHash}`);
      return {
        success: true,
        data: {
          transcription: cachedEntry.transcriptionData,
          formats: cachedEntry.formats,
          fromCache: true
        }
      };
    }

    try {
      // 进行转录（根据用户等级选择模型）
      const transcription = await this.transcriptionService.transcribeAudio(filePath, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      });

      // 估算成本
      const estimatedCost = this.transcriptionService.estimateCost(transcription.duration);

      // 生成不同格式
      const formats = await this.generateFormats(transcription);

      // 缓存结果
      await transcriptionCache.set(
        'user_file',
        fileHash,
        transcription,
        formats,
        {
          userTier: request.options?.userTier
        },
        { userId: request.options?.userId }
      );

      // 写入数据库（仅登录用户）
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          let jobId = crypto.randomUUID();
          const row = await createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'file_upload',
            source_hash: fileHash,
            source_url: filePath,
            title: 'uploaded file',
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          });
          jobId = (row as any).job_id || jobId;
          await upsertTranscriptionFormats(jobId, formats);
        } catch(e) {
          console.warn('DB write skipped:', e);
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          fromCache: false,
          estimatedCost
        }
      };
    } catch (error) {
      console.error('File transcription failed:', error);
      return {
        success: false,
        error: `File transcription failed: ${error}`
      };
    }
  }

  /**
   * 生成90秒预览
   */
  async generatePreview(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      if (request.type === 'youtube_url') {
        return await this.generateYouTubePreview(request);
      } else {
        return await this.generateFilePreview(request);
      }
    } catch (error) {
      return {
        success: false,
        error: `Preview generation failed: ${error}`
      };
    }
  }

  /**
   * 生成 YouTube 预览
   */
  private async generateYouTubePreview(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const videoId = YouTubeService.validateAndParseUrl(request.content);
    if (!videoId) {
      return { success: false, error: 'Invalid YouTube URL' };
    }

    // 检查缓存中是否有完整转录
    const cachedEntry = await transcriptionCache.get('youtube', videoId);
    if (cachedEntry) {
      const preview = this.extractPreview(cachedEntry.transcriptionData, cachedEntry.formats);
      return {
        success: true,
        preview
      };
    }

    // 获取视频信息
    const videoInfo = await YouTubeService.getVideoInfo(videoId);
    
    // 如果有字幕，快速生成预览
    if (videoInfo.captions && videoInfo.captions.length > 0) {
      const bestCaption = YouTubeService.selectBestCaption(videoInfo.captions);
      if (bestCaption) {
        const captionText = await YouTubeService.downloadCaption(bestCaption.url);
        const captionSRT = await YouTubeService.convertCaptionToSRT(bestCaption.url);
        
        const preview = {
          text: this.truncateText(captionText, 90),
          srt: this.truncateSRT(captionSRT, 90),
          duration: 90
        };

        return { success: true, preview };
      }
    }

    // 如果没有字幕，尝试进行音频转录生成预览（使用降级机制）
    // 但是对于未登录用户，我们应该限制这个功能避免成本过高
    const isAuthenticated = request.options?.userId ? true : false;
    
    // 如果未登录且没有字幕，根据开关决定是否允许匿名预览
    const allowAnonPreview = process.env.PREVIEW_ALLOW_ANON === '1' || process.env.PREVIEW_ALLOW_ANON === 'true';
    if (!isAuthenticated && !allowAnonPreview) {
      console.log('Unauthenticated user without captions - skipping audio transcription');
      return {
        success: true,
        preview: {
          text: "Sign in to generate AI-powered preview for videos without captions.",
          srt: "",
          duration: 0
        }
      };
    }
    if (!isAuthenticated && allowAnonPreview) {
      console.log('Anonymous preview allowed by PREVIEW_ALLOW_ANON; proceeding with 90s clip transcription');
    }
    
    try {
      console.log('No captions found, attempting audio transcription with fallback...');
      
      // 使用完整的下载逻辑（包含降级机制）
      const downloadOptions = this.createOptimizedDownloadOptions(request, videoInfo.duration);
      
      // 先尝试优化下载，失败后自动降级
      let audioBuffer: Buffer;
      try {
        audioBuffer = await YouTubeService.downloadAudioStreamOptimized(
          videoInfo.videoId,
          downloadOptions
        );
      } catch (optimizedError) {
        console.warn('Optimized download failed, trying ytdl-core stream...');
        audioBuffer = await YouTubeService.downloadAudioWithYtdlStream(
          videoInfo.videoId,
          { ...downloadOptions, timeout: 60000 }
        );
      }

      // 上传原音频到 R2（临时），随后用 ffmpeg 从该 URL 生成 90s WAV 片段
      const audioFileName = `youtube_preview_${videoInfo.videoId}_${Date.now()}.m4a`;
      const uploadResult = await this.r2Service.uploadFile(
        audioBuffer,
        audioFileName,
        'audio/mp4',
        { folder: 'youtube-preview-src', expiresIn: 1, makePublic: true }
      );

      // 生成 90 秒 WAV 片段
      const { createWavClipFromUrl } = await import('./audio-clip');
      console.log('[Preview] Clipping 90s WAV from uploaded YouTube audio (ffmpeg)');
      const wavClip = await createWavClipFromUrl(uploadResult.url, 90);
      const clipUpload = await this.r2Service.uploadFile(
        wavClip,
        `youtube_preview_clip_${videoInfo.videoId}_${Date.now()}.wav`,
        'audio/wav',
        { folder: 'youtube-preview', expiresIn: 1, makePublic: true }
      );

      // 转录音频（预览模式使用快速模型），仅对片段进行
      console.log(`Starting preview transcription with URL: ${clipUpload.url}`);
      console.log(`Preview options: isPreview=true, userTier=${request.options?.userTier || 'pro'}`);
      
      const transcription = await this.transcriptionService.transcribeAudio(clipUpload.url, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier || 'pro', // 预览模式优先使用快速模型
        isPreview: true,
        fallbackEnabled: request.options?.fallbackEnabled !== false, // 预览默认启用降级
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      });

      // 异步清理临时文件
      setTimeout(async () => {
        try {
          await this.r2Service.deleteFile(uploadResult.key);
          await this.r2Service.deleteFile(clipUpload.key);
        } catch (error) {
          console.error('Failed to cleanup preview audio:', error);
        }
      }, 30000);

      // 提取90秒预览
      const preview = this.extractPreview(transcription, {
        txt: transcription.text,
        srt: this.transcriptionService.convertToSRT(transcription)
      });

      return { success: true, preview };
    } catch (error) {
      console.error('YouTube preview generation failed with all methods:', error);
      
      // 如果是网络或API错误，返回错误状态
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 检查是否是特定的已知错误
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        return {
          success: false,
          error: 'Unable to access video. It may be private, age-restricted, or region-locked.'
        };
      }
      
      if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        return {
          success: false,
          error: 'Request timed out. Please try again.'
        };
      }
      
      // 对于其他错误，返回通用的预览不可用消息，但仍标记为成功避免前端显示错误
      return {
        success: true,
        preview: {
          text: "Preview temporarily unavailable. Please sign in for full transcription.",
          srt: "",
          duration: 0
        }
      };
    }
  }

  /**
   * 生成文件预览
   */
  private async generateFilePreview(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      // 改为：先对原始 URL 生成 90s WAV 片段，再仅对片段转录
      console.log('Generating file preview by clipping 90s WAV probe...');
      const { createWavClipFromUrl } = await import('./audio-clip');
      console.log('[Preview] Clipping 90s WAV from file/audio URL (ffmpeg)');
      const wavClip = await createWavClipFromUrl(request.content, 90);

      const clipUpload = await this.r2Service.uploadFile(
        wavClip,
        `file_preview_clip_${Date.now()}.wav`,
        'audio/wav',
        { folder: 'file-preview', expiresIn: 1, makePublic: true }
      );

      const transcription = await this.transcriptionService.transcribeAudio(clipUpload.url, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier || 'pro',
        isPreview: true,
        fallbackEnabled: request.options?.fallbackEnabled !== false,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      });

      setTimeout(() => this.r2Service.deleteFile(clipUpload.key).catch(() => {}), 30000);

      const preview = this.extractPreview(transcription, {
        txt: transcription.text,
        srt: this.transcriptionService.convertToSRT(transcription)
      });

      return { success: true, preview };
    } catch (error) {
      console.error('File preview generation failed:', error);
      return {
        success: false,
        error: `Preview generation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 生成不同格式的转录文件
   */
  private async generateFormats(transcription: TranscriptionResult, title?: string): Promise<Record<string, string>> {
    return {
      txt: this.transcriptionService.convertToPlainText(transcription),
      srt: this.transcriptionService.convertToSRT(transcription),
      vtt: this.transcriptionService.convertToVTT(transcription),
      json: this.transcriptionService.convertToJSON(transcription),
      md: this.transcriptionService.convertToMarkdown(transcription, title)
    };
  }

  /**
   * 对直链音频/已上传文件进行语言探针
   */
  async probeLanguageFromUrl(audioUrl: string, options?: { userTier?: string; languageProbeSeconds?: number }): Promise<{ language: string; isChinese: boolean }> {
    try {
      const seconds = Math.max(8, Math.min(12, options?.languageProbeSeconds || 10));
      console.log(`[Probe] Start creating ${seconds}s WAV clip for language detection`);
      // Create short WAV clip via ffmpeg
      const { createWavClipFromUrl } = await import('./audio-clip');
      const wavClip = await createWavClipFromUrl(audioUrl, seconds);

      // Upload to R2 (short-lived)
      console.log(`[Probe] Uploading WAV clip to R2 (size=${wavClip.length} bytes)`);
      const uploaded = await this.r2Service.uploadFile(
        wavClip,
        `probe_${Date.now()}.wav`,
        'audio/wav',
        { folder: 'probe-clips', expiresIn: 1, makePublic: true }
      );

      // Call probe on the clip URL (no further clipping needed)
      console.log('[Probe] Calling Deepgram language probe on clip URL');
      const res = await this.transcriptionService.probeLanguage(uploaded.url, {
        userTier: options?.userTier,
      } as any);

      // Schedule cleanup
      setTimeout(() => this.r2Service.deleteFile(uploaded.key).catch(() => {}), 30000);
      console.log('[Probe] Deepgram result:', res);
      return res;
    } catch (e) {
      console.warn('Language probe (wav clip) failed:', e);
      return { language: 'unknown', isChinese: false };
    }
  }

  /**
   * 从完整转录中提取预览
   */
  private extractPreview(transcription: TranscriptionResult, formats: Record<string, string>): NonNullable<TranscriptionResponse['preview']> {
    // 使用优化后的标点符号处理
    const optimizedText = this.transcriptionService.convertToPlainText(transcription);
    
    return {
      text: this.truncateText(optimizedText, 90),
      srt: this.truncateSRT(formats.srt || '', 90),
      duration: Math.min(90, transcription.duration)
    };
  }

  /**
   * 截取文本到指定秒数
   */
  private truncateText(text: string, maxSeconds: number): string {
    const words = text.split(' ');
    const wordsPerSecond = 2.5; // 平均说话速度
    const maxWords = Math.floor(maxSeconds * wordsPerSecond);
    
    if (words.length <= maxWords) return text;
    
    return words.slice(0, maxWords).join(' ') + '...';
  }

  /**
   * 截取SRT到指定秒数
   */
  private truncateSRT(srt: string, maxSeconds: number): string {
    const lines = srt.split('\n');
    const result: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查时间戳行
      if (line.includes(' --> ')) {
        const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          currentTime = hours * 3600 + minutes * 60 + seconds;
          
          if (currentTime >= maxSeconds) {
            break;
          }
        }
      }
      
      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * 生成文件哈希
   */
  private deriveCacheKeyForFile(contentUrl: string, r2Key?: string): string {
    if (r2Key) return `r2:${r2Key}`;
    try {
      const url = new URL(contentUrl);
      // 去掉签名等查询参数，仅保留稳定的路径
      return `url:${url.origin}${url.pathname}`;
    } catch {
      // 回退到原字符串的MD5，最差也能稳定对应相同输入
      return crypto.createHash('md5').update(contentUrl).digest('hex');
    }
  }
}
