import { YouTubeService, VideoInfo } from './youtube';
import { ReplicateService, TranscriptionResult } from './replicate';
import { transcriptionCache, CacheEntry } from './cache';
import crypto from 'crypto';

export interface TranscriptionRequest {
  type: 'youtube_url' | 'file_upload';
  content: string; // URL 或 文件路径
  options?: {
    language?: string;
    userId?: string;
    userTier?: string;
    formats?: string[]; // ['txt', 'srt', 'vtt', 'json', 'md']
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
  private replicateService: ReplicateService;

  constructor(replicateApiToken: string) {
    this.replicateService = new ReplicateService(replicateApiToken);
  }

  /**
   * 主要的转录处理函数
   */
  async processTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      if (request.type === 'youtube_url') {
        return await this.processYouTubeTranscription(request);
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
   * 处理 YouTube 音频转录
   */
  private async processYouTubeAudioTranscription(videoInfo: VideoInfo, request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      // 获取音频流
      const audioUrl = await YouTubeService.getAudioStreamUrl(videoInfo.videoId);
      
      // 估算成本
      const estimatedCost = this.replicateService.estimateCost(videoInfo.duration);
      console.log(`Estimated transcription cost: $${estimatedCost.toFixed(4)}`);

      // 进行转录
      const transcription = await this.replicateService.transcribeAudio(audioUrl, {
        language: request.options?.language || 'auto'
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
          userTier: request.options?.userTier
        },
        { userId: request.options?.userId }
      );

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
      console.error('Audio transcription failed:', error);
      return {
        success: false,
        error: `Audio transcription failed: ${error}`
      };
    }
  }

  /**
   * 处理文件上传转录
   */
  private async processFileTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    const filePath = request.content;
    
    // 生成文件哈希作为缓存键
    const fileHash = await this.generateFileHash(filePath);
    
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
      // 进行转录
      const transcription = await this.replicateService.transcribeAudio(filePath, {
        language: request.options?.language || 'auto'
      });

      // 估算成本
      const estimatedCost = this.replicateService.estimateCost(transcription.duration);

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

    // 如果没有字幕，返回提示需要完整转录
    return {
      success: true,
      preview: {
        text: "No existing captions found. Full transcription with AI will be required to generate preview.",
        srt: "",
        duration: 0
      }
    };
  }

  /**
   * 生成文件预览
   */
  private async generateFilePreview(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    // 对于文件，我们需要实际进行转录才能生成预览
    // 这里可以考虑只转录前90秒，但Replicate的Whisper API通常需要处理整个文件
    return {
      success: true,
      preview: {
        text: "File upload detected. Full transcription processing will be required to generate preview.",
        srt: "",
        duration: 0
      }
    };
  }

  /**
   * 生成不同格式的转录文件
   */
  private async generateFormats(transcription: TranscriptionResult, title?: string): Promise<Record<string, string>> {
    return {
      txt: this.replicateService.convertToPlainText(transcription),
      srt: this.replicateService.convertToSRT(transcription),
      vtt: this.replicateService.convertToVTT(transcription),
      json: this.replicateService.convertToJSON(transcription),
      md: this.replicateService.convertToMarkdown(transcription, title)
    };
  }

  /**
   * 从完整转录中提取预览
   */
  private extractPreview(transcription: TranscriptionResult, formats: Record<string, string>): NonNullable<TranscriptionResponse['preview']> {
    return {
      text: this.truncateText(transcription.text, 90),
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
  private async generateFileHash(filePath: string): Promise<string> {
    // 这里应该基于文件内容生成哈希，简化实现
    return crypto.createHash('md5').update(filePath).digest('hex');
  }
}