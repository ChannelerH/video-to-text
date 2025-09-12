import { YouTubeService, VideoInfo, DownloadOptions, DownloadProgress } from './youtube';
import { TranscriptionResult } from './replicate';
import { UnifiedTranscriptionService } from './unified-transcription';
import { transcriptionCache, CacheEntry } from './cache';
import { CloudflareR2Service } from './r2-upload';
import { localChinesePunctuate, localPunctuateSegmentsIfChinese, rebuildTextFromSegments } from './refine-local';
import { alignSentencesWithSegments } from './sentence-align';
import { punctuateTextLLM } from './punctuate-llm';
import { fixLatinNoise, fixLatinNoiseInSegments } from './lexicon-fix';
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
    enableDiarizationAfterWhisper?: boolean; // PRO附加选项：Whisper后叠加Deepgram说话人分离
    outputFormat?: 'json' | 'srt'; // Deepgram输出格式
    formats?: string[]; // ['txt', 'srt', 'vtt', 'json', 'md']
    r2Key?: string; // 对于文件上传，传入 R2 对象键用于稳定缓存
    downloadOptions?: DownloadOptions; // YouTube 下载优化选项
    onDownloadProgress?: (progress: DownloadProgress) => void; // 下载进度回调
    languageProbeSeconds?: number; // 语言探针秒数（前端可传 8-12）
    forceChinese?: boolean; // 前端探针结果强制中文
    skipCaptions?: boolean; // 跳过YouTube字幕，直接音频转录
    streamProgress?: boolean; // 是否启用流式进度更新
    onProgress?: (progress: {
      stage: 'download' | 'transcribe' | 'process';
      percentage: number;
      message: string;
      estimatedTime?: string;
    }) => void; // 总体进度回调
  };
}

export interface TranscriptionResponse {
  success: boolean;
  data?: {
    transcription: TranscriptionResult;
    formats: Record<string, string>;
    videoInfo?: VideoInfo;
    jobId?: string;
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

  // Timing helper for stage logging
  private async time<T>(label: string, p: Promise<T>): Promise<T> {
    const s = Date.now();
    try { return await p; } finally { console.log(`[Stage] ${label} ${Date.now() - s}ms`); }
  }

  // Distinguish cache variant by behavior (e.g., Pro high-accuracy on/off)
  private variantSuffix(options?: TranscriptionRequest['options']): string {
    const ha = !!(options?.highAccuracyMode && options?.userTier === 'pro');
    return ha ? ':ha1' : ':ha0';
  }

  // Helper method to estimate total processing time based on video duration
  private estimateProcessingTime(durationInSeconds: number): string {
    // durationInSeconds: 视频的总时长（秒）
    // Based on experience: ~3s per minute of video for download + transcription
    const estimatedSeconds = Math.ceil(durationInSeconds / 60) * 3;
    
    if (estimatedSeconds < 60) {
      return `~${estimatedSeconds}s`;
    } else if (estimatedSeconds < 3600) {
      const minutes = Math.floor(estimatedSeconds / 60);
      const seconds = estimatedSeconds % 60;
      return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
    } else {
      const hours = Math.floor(estimatedSeconds / 3600);
      const minutes = Math.floor((estimatedSeconds % 3600) / 60);
      return minutes > 0 ? `~${hours}h ${minutes}m` : `~${hours}h`;
    }
  }

  // Helper method to estimate remaining time based on progress
  private estimateRemainingTime(durationInSeconds: number, currentProgress: number): string {
    // durationInSeconds: 视频的总时长（秒）
    // currentProgress: 当前进度百分比 (0-100)
    
    // 特殊处理95%的情况，避免显示0s让用户困惑
    if (currentProgress >= 95 && currentProgress < 100) {
      return '~5s';
    }
    
    const totalEstimatedSeconds = Math.ceil(durationInSeconds / 60) * 3;
    const remainingSeconds = Math.ceil(totalEstimatedSeconds * (100 - currentProgress) / 100);
    
    // 确保最小显示时间，避免显示0s
    if (remainingSeconds <= 0) {
      return '< 1s';
    }
    
    if (remainingSeconds < 60) {
      return `~${remainingSeconds}s`;
    } else if (remainingSeconds < 3600) {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.floor((remainingSeconds % 3600) / 60);
      return minutes > 0 ? `~${hours}h ${minutes}m` : `~${hours}h`;
    }
  }

  /**
   * 主要的转录处理函数
   */
  async processTranscription(request: TranscriptionRequest): Promise<TranscriptionResponse> {
    try {
      const overallStart = Date.now();
      const onProgress = request.options?.onProgress;
      
      // Report initial progress
      if (onProgress) {
        onProgress({
          stage: 'download',
          percentage: 0,
          message: 'Initializing...'
        });
      }
      
      const res = request.type === 'youtube_url'
        ? await this.processYouTubeTranscription(request)
        : request.type === 'audio_url'
          ? await this.processAudioUrlTranscription(request)
          : await this.processFileTranscription(request);
      console.log(`[Stage] overall.${request.type} ${Date.now() - overallStart}ms`);
      return res;
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
      console.warn('[TEST][ERR-001] invalid_youtube_url', { url });
      return {
        success: false,
        error: 'Invalid YouTube URL'
      };
    }

    // begin youtube processing

    // 2.（已禁用缓存）始终走新转写

    // 3. 获取视频信息
    let videoInfo: VideoInfo;
    try {
      videoInfo = await this.time('youtube.get_info', YouTubeService.getVideoInfo(videoId));
    } catch (error) {
      return {
        success: false,
        error: 'Failed to access video. It might be private, age-restricted, or unavailable in your region.'
      };
    }

    console.log(`Video info: ${videoInfo.title} (${videoInfo.duration}s)`);

    // 4/5. 字幕处理策略：可通过环境变量或用户等级控制
    const skipCaptions = process.env.SKIP_YOUTUBE_CAPTIONS === 'true' || 
                         request.options?.skipCaptions === true;
    
    if (!skipCaptions && videoInfo.captions && videoInfo.captions.length > 0) {
      console.log(`[YouTube] Found ${videoInfo.captions.length} caption tracks`);
      const captionTask = this.downloadCaptionBundle(videoInfo, request);
      const timeout = new Promise<null>(resolve => setTimeout(() => {
        console.log('[TEST][YT-001] caption.timeout.1s');
        resolve(null);
      }, 1000)); // 减少到1秒，更快失败
      const quick = await Promise.race([captionTask, timeout]);
      if (quick && (quick as any).success) {
        // 用带持久化的完整流程，保持一致
        return await this.processYouTubeCaptions(videoInfo, request);
      }
      console.log('[TEST][YT-001] caption.skipped.timeout_or_empty');
      // 否则进入音频转录
      return await this.processYouTubeAudioTranscription(videoInfo, request);
    } else if (skipCaptions && videoInfo.captions && videoInfo.captions.length > 0) {
      console.log(`[YouTube] Skipping ${videoInfo.captions.length} caption tracks (config: SKIP_YOUTUBE_CAPTIONS)`);
    }

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

      // 下载字幕
      let captionText = await this.time('youtube.captions.text', YouTubeService.downloadCaption(bestCaption.url));
      const captionSRT = await this.time('youtube.captions.srt', YouTubeService.convertCaptionToSRT(bestCaption.url));
      if ((!captionText || captionText.trim().length === 0) && captionSRT && captionSRT.length > 0) {
        try {
          const srtLines = captionSRT.split('\n');
          const textLines: string[] = [];
          for (const line of srtLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (/^\d+$/.test(trimmed)) continue;
            if (trimmed.includes('-->')) continue;
            textLines.push(trimmed);
          }
          const rebuilt = textLines.join(' ').replace(/\s{2,}/g, ' ').trim();
          if (rebuilt) captionText = rebuilt;
        } catch (e) {
          // ignore
        }
      }

      // 构造转录结果（若字幕仍为空，则回退到音频转录）
      if ((!captionText || captionText.trim().length === 0) && (!captionSRT || captionSRT.trim().length === 0)) {
        console.warn('[YouTube][Caption] Empty caption content after fetch; falling back to audio transcription');
        return await this.processYouTubeAudioTranscription(videoInfo, request);
      }

      // 构造转录结果
      const transcription: TranscriptionResult = {
        text: captionText,
        segments: [], // YouTube字幕不提供segment信息
        language: bestCaption.languageCode,
        duration: videoInfo.duration
      };
      console.log('[TEST][YT-001] captions.used', { videoId: videoInfo.videoId, lang: transcription.language, duration: transcription.duration });

      // 本地中文规范化（仅文本，不改原始 SRT）+ 英文术语修复 + 可选LLM标点增强
      try {
        const isZh = (transcription.language || '').toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(transcription.text || '');
        let t = transcription.text || '';
        if (isZh) t = localChinesePunctuate(t);
        // 尝试 LLM 标点增强（不改词）
        try {
          const llm = await punctuateTextLLM(t, { language: 'zh' });
          if (llm) t = llm;
        } catch {}
        transcription.text = fixLatinNoise(t);
      } catch {}

      // 生成不同格式（TXT/MD/JSON 使用处理后的 text；SRT 使用 YouTube 原生）
      const formats = await this.time('formats.generate', this.generateFormats(transcription, videoInfo.title));
      formats.srt = captionSRT;
      console.log('[TEST][FMT-001] formats.fromCaptions', { txt: !!formats.txt, srt: !!formats.srt, vtt: !!formats.vtt, json: !!formats.json, md: !!formats.md });

      // 缓存结果（保存处理后的文本）
      await this.time('cache.set', transcriptionCache.set(
        'youtube',
        videoInfo.videoId + this.variantSuffix(request.options),
        transcription,
        formats,
        {
          originalUrl: request.content,
          videoTitle: videoInfo.title,
          userTier: request.options?.userTier
        },
        { userId: request.options?.userId }
      ));
      console.log('[CACHE] youtube.cache.set', { videoId: videoInfo.videoId, variant: this.variantSuffix(request.options) });

      let jobId = crypto.randomUUID();

      // 写入数据库（仅登录用户）
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          const row = await this.time('db.write', createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'youtube_url',
            source_hash: videoInfo.videoId + this.variantSuffix(request.options),
            source_url: request.content,
            title: videoInfo.title,
            language: transcription.language,
            duration_sec: videoInfo.duration,
            cost_minutes: Math.ceil(videoInfo.duration/60),
            status: 'completed'
          }));
          jobId = (row as any).job_id || jobId;
          await this.time('db.write_formats', upsertTranscriptionFormats(jobId, formats));
        } catch (e) {
          // ignore
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          videoInfo,
          jobId: request.options?.userId ? jobId : undefined,
          fromCache: false,
          estimatedCost: 0 // 使用现有字幕无成本
        }
      };
    } catch (error) {
      console.error('Caption processing failed, falling back to audio transcription:', error);
      return await this.processYouTubeAudioTranscription(videoInfo, request);
    }
  }

  // 快速下载字幕+SRT，仅用于竞赛，不做持久化
  private async downloadCaptionBundle(videoInfo: VideoInfo, request: TranscriptionRequest): Promise<TranscriptionResponse | null> {
    try {
      const bestCaption = YouTubeService.selectBestCaption(
        videoInfo.captions!,
        request.options?.language ? [request.options.language] : ['en', 'en-US']
      );
      if (!bestCaption) return null;
      const captionText = await YouTubeService.downloadCaption(bestCaption.url);
      const captionSRT = await YouTubeService.convertCaptionToSRT(bestCaption.url);
      if ((!captionText || captionText.trim().length === 0) && (!captionSRT || captionSRT.trim().length === 0)) {
        return null;
      }
      const transcription: TranscriptionResult = {
        text: captionText || '',
        segments: [],
        language: bestCaption.languageCode,
        duration: videoInfo.duration
      };
      const formats = await this.generateFormats(transcription, videoInfo.title);
      if (captionSRT) formats.srt = captionSRT;
      return { success: true, data: { transcription, formats, videoInfo, fromCache: false, estimatedCost: 0 } };
    } catch { return null; }
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
      console.log('[TEST][DL-001] download.options', {
        enableParallel: downloadOptions.enableParallelDownload,
        chunkSize: downloadOptions.chunkSize,
        maxConcurrentChunks: downloadOptions.maxConcurrentChunks
      });

      let audioBuffer: Buffer;
      let downloadMethod = 'optimized';
      let downloadAttempts = 0;
      // 快速失败：只尝试一次优化下载，失败立即降级
      const maxAttempts = 1;

      // Report download phase
      if (request.options?.onProgress) {
        const estimatedTime = this.estimateProcessingTime(videoInfo.duration);
        request.options.onProgress({
          stage: 'download',
          percentage: 10,
          message: 'Downloading audio...',
          estimatedTime
        });
      }

      // 带重试的下载逻辑
      const _dlStart = Date.now();
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
            // optimized download completed
            break; // 成功，退出循环
          } else {
            throw new Error('Video not optimized for parallel download, skipping to fallback');
          }
        } catch (optimizedError) {
          console.warn(`Optimized download failed, immediately falling back:`, optimizedError);
          
          // 立即降级到 ytdl-core，不重试
          // 尝试 ytdl-core 流式下载作为降级方案
          try {
            console.log('[TEST][DL-002] fallback.ytdl');
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
            // ytdl-core download completed
            break;
          } catch (streamError) {
            console.warn('[TEST][DL-002] fallback.ytdl.failed', streamError);
            
            // 最终降级到传统方法（带重试）
            try {
              // final legacy fallback
              downloadMethod = 'legacy';
              
              // 使用改进的 getAudioStreamUrl 方法（带重试）
              const audioStreamUrl = await YouTubeService.getAudioStreamUrl(videoInfo.videoId);
              
              // 带超时和重试的 fetch
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 120000); // 增加超时时间到120秒
              
              // fetching stream URL
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
              
              // legacy download starting
              
              audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
              // legacy download completed
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
      console.log(`[Stage] youtube.download_audio ${Date.now() - _dlStart}ms`);

      // Report transcription phase
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'transcribe',
          percentage: 40,
          message: 'Transcribing audio...',
          estimatedTime: this.estimateRemainingTime(videoInfo.duration, 40)
        });
      }

      // 生成临时文件名，包含下载方法信息用于调试
      const audioFileName = `youtube_${videoInfo.videoId}_${downloadMethod}_${Date.now()}.m4a`;
      
      // 上传音频到 Cloudflare R2
      const uploadResult = await this.time('r2.upload', this.r2Service.uploadFile(
        audioBuffer,
        audioFileName,
        'audio/mp4', // YouTube 音频流通常是 M4A/MP4 格式
        {
          folder: 'youtube-audio',
          expiresIn: 2, // 2小时后自动删除
          makePublic: true
        }
      ));

      // 使用 R2 URL 进行转录
      // Do NOT infer language from title; rely on auto-detect + guard logic.
      const preferredLang = request.options?.language || 'auto';
      const transcription = await this.time('model.transcribe', this.transcriptionService.transcribeAudio(uploadResult.url, {
        language: preferredLang,
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      }));
      console.log('[TEST][YT-002] model.used', { model: 'deepgram_or_whisper_decided_above' });

      // Optional: overlay diarization for PRO users when enabled
      const enableOverlay = !!request.options?.enableDiarizationAfterWhisper && request.options?.userTier === 'pro';
      if (enableOverlay) {
        try {
          const ok = await this.transcriptionService.addDiarizationFromUrl(uploadResult.url, transcription);
          console.log('[Overlay] diarization after-whisper', ok ? 'applied' : 'skipped');
        } catch {}
      }

      // 本地中文规范化：段内标点与句末补全（不改时间戳）并重建全文 + 英文术语修复 + 可选LLM标点增强
      try {
        const { isChineseLangOrText } = await import('./refine-local');
        const isZh = isChineseLangOrText(transcription.language, transcription.text);
        if (isZh) {
          const changed = localPunctuateSegmentsIfChinese(transcription.segments as any, transcription.language);
          if (changed) console.log(`[Punct] youtube_audio.segments normalized: ${changed}`);
          let t = changed
            ? rebuildTextFromSegments(transcription.segments as any)
            : localChinesePunctuate(transcription.text || '');
          try {
            const llm = await punctuateTextLLM(t, { language: 'zh' });
            if (llm) { console.log('[Punct][LLM] youtube_audio applied'); t = llm; }
          } catch {}
          fixLatinNoiseInSegments(transcription.segments as any);
          const finalText = fixLatinNoise(t);
          if (finalText !== t) console.log('[Punct] youtube_audio.lexicon fixed');
          transcription.text = finalText;
        }
      } catch {}

      // 对齐最终文本句子到模型时间戳：仅在中文等需要强可读性的场景执行；
      // 英文等情况下保持 Whisper 原始分段以保证时间更稳。
      try {
        const { isChineseLangOrText } = await import('./refine-local');
        const shouldAlign = isChineseLangOrText(transcription.language, transcription.text);
        if (shouldAlign) {
          transcription.segments = alignSentencesWithSegments(
            transcription.text,
            transcription.segments as any,
            transcription.language
          );
          // Ensure SRT/VTT regenerated from updated sentence-level segments
          (transcription as any).srtText = undefined;
        } else {
          console.log('[Align] Skipped sentence realignment for non-Chinese to preserve timing');
        }
      } catch {}

      // Report formatting phase
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'process',
          percentage: 85,
          message: 'Generating formats...',
          estimatedTime: this.estimateRemainingTime(videoInfo.duration, 85)
        });
      }

      // 生成不同格式
      const formats = await this.time('formats.generate', this.generateFormats(transcription, videoInfo.title));
      console.log('[TEST][FMT-001] formats.generated', { txt: !!formats.txt, srt: !!formats.srt, vtt: !!formats.vtt, json: !!formats.json, md: !!formats.md });

      // Report near completion
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'process',
          percentage: 95,
          message: 'Finalizing...',
          estimatedTime: '~5s'
        });
      }

      // （已禁用缓存）不写入缓存

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

      // 写入数据库（仅登录用户，保存润色后的文本）
      let jobId: string | undefined;
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          jobId = crypto.randomUUID();
          const row = await createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'youtube_url',
            source_hash: videoInfo.videoId + this.variantSuffix(request.options),
            source_url: request.content,
            title: videoInfo.title,
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          });
          jobId = (row as any).job_id || jobId;
          if (jobId) {
            await upsertTranscriptionFormats(jobId, formats);
          }
        } catch (e) {
          console.warn('DB write skipped:', e);
        }
      }

      // Report 100% completion
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'process',
          percentage: 100,
          message: 'Completed',
          estimatedTime: '0s'
        });
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          videoInfo,
          jobId,
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
      const audioInfo = await this.time('audio.detect', this.detectAudioUrl(url));
      if (!audioInfo.isValid) {
        return {
          success: false,
          error: audioInfo.error || 'Invalid audio URL'
        };
      }

      console.log(`Audio detected: ${audioInfo.contentType}, ${audioInfo.sizeInfo}`);

      // 2.（已禁用缓存）始终走新转写
      const urlHash = crypto.createHash('sha256').update(url).digest('hex');

      // 3. 下载音频文件
      const audioBuffer = await this.time('audio.download', this.downloadAudioFromUrl(url, audioInfo));
      console.log(`Audio downloaded: ${Math.round(audioBuffer.length / 1024 / 1024 * 100) / 100}MB`);

      // 4. 上传到 R2
      const fileExtension = this.getFileExtensionFromContentType(audioInfo.contentType || 'audio/mpeg');
      const audioFileName = `audio_${Date.now()}.${fileExtension}`;
      
      const uploadResult = await this.time('r2.upload', this.r2Service.uploadFile(
        audioBuffer,
        audioFileName,
        audioInfo.contentType || 'audio/mpeg',
        {
          folder: 'audio-urls',
          expiresIn: 2, // 2小时后自动删除
          makePublic: true
        }
      ));
      console.log(`Audio uploaded to R2: ${uploadResult.key} (${Math.round(audioBuffer.length / 1024 / 1024)}MB)`);

      // 5. 使用 R2 URL 进行转录
      const transcription = await this.time('model.transcribe', this.transcriptionService.transcribeAudio(uploadResult.url, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      }));
      console.log('[TEST][HA-001] transcribe.audio_url.completed', { duration: transcription.duration, language: transcription.language });

      // 可选：为 PRO 用户叠加话者分离（Deepgram）
      const enableOverlay = !!request.options?.enableDiarizationAfterWhisper && request.options?.userTier === 'pro';
      if (enableOverlay) {
        try { await this.transcriptionService.addDiarizationFromUrl(uploadResult.url, transcription); } catch {}
      }

      // 6. 本地中文规范化（如适用）+ 英文术语修复 + 可选LLM标点增强
      try {
        const { isChineseLangOrText } = await import('./refine-local');
        const isZh = isChineseLangOrText(transcription.language, transcription.text);
        if (isZh) {
          const changed = localPunctuateSegmentsIfChinese(transcription.segments as any, transcription.language);
          if (changed) console.log(`[Punct] audio_url.segments normalized: ${changed}`);
          let t = changed
            ? rebuildTextFromSegments(transcription.segments as any)
            : localChinesePunctuate(transcription.text || '');
          try {
            const llm = await punctuateTextLLM(t, { language: 'zh' });
            if (llm) { console.log('[Punct][LLM] audio_url applied'); t = llm; }
          } catch {}
          fixLatinNoiseInSegments(transcription.segments as any);
          const finalText = fixLatinNoise(t);
          if (finalText !== t) console.log('[Punct] audio_url.lexicon fixed');
          transcription.text = finalText;
        }
      } catch {}

      // 对齐最终文本句子到模型时间戳：仅在中文等需要强可读性的场景执行
      try {
        const { isChineseLangOrText } = await import('./refine-local');
        const shouldAlign = isChineseLangOrText(transcription.language, transcription.text);
        if (shouldAlign) {
          transcription.segments = alignSentencesWithSegments(
            transcription.text,
            transcription.segments as any,
            transcription.language
          );
          (transcription as any).srtText = undefined;
        } else {
          console.log('[Align] Skipped sentence realignment for non-Chinese to preserve timing');
        }
      } catch {}

      // 7. 生成不同格式
      const formats = await this.time('formats.generate', this.generateFormats(transcription, audioInfo.filename || 'audio'));
      console.log('[TEST][FMT-001] formats.generated', { txt: !!formats.txt, srt: !!formats.srt, vtt: !!formats.vtt, json: !!formats.json, md: !!formats.md });

      // （已禁用缓存）不写入缓存

      // 9. 异步清理 R2 文件
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

      // 9. 写入数据库（仅登录用户）
      let jobId: string | undefined;
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          jobId = crypto.randomUUID();
          const row = await this.time('db.write', createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'audio_url',
            source_hash: urlHash + this.variantSuffix(request.options),
            source_url: url,
            title: audioInfo.filename,
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          }));
          jobId = (row as any).job_id || jobId;
          if (jobId) {
            await this.time('db.write_formats', upsertTranscriptionFormats(jobId, formats));
          }
        } catch (e) {
          console.warn('DB write skipped:', e);
        }
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          jobId,
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
      console.log('[AudioURL] HEAD OK type=%s length=%s', contentType, contentLength || 'unknown');

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
    
    // 速度优先模式：通过环境变量启用更激进的下载参数
    const speedMode = process.env.YOUTUBE_SPEED_MODE === 'true';
    
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
        chunkSize: speedMode ? 4 * 1024 * 1024 : 2 * 1024 * 1024, // 速度模式4MB，否则2MB
        maxConcurrentChunks: speedMode ? 12 : 8, // 速度模式12并发，否则8并发
        timeout: 180000, // 3分钟超时
        retryAttempts: speedMode ? 1 : 2, // 速度模式不重试
        retryDelay: 300, // 更短的重试延迟
        ...request.options?.downloadOptions
      };
    } else if (userTier === 'pro') {
      // 专业用户：高性能设置
      return {
        ...baseOptions,
        chunkSize: speedMode ? 3 * 1024 * 1024 : 1.5 * 1024 * 1024, // 速度模式3MB，否则1.5MB
        maxConcurrentChunks: speedMode ? 10 : 6, // 速度模式10并发，否则6并发
        timeout: 150000,
        retryAttempts: speedMode ? 1 : 2, // 速度模式不重试
        retryDelay: 500,
        ...request.options?.downloadOptions
      };
    } else if (videoDuration > 3600) {
      // 超过1小时的长视频：优化大文件下载
      return {
        ...baseOptions,
        chunkSize: speedMode ? 4 * 1024 * 1024 : 2 * 1024 * 1024, // 速度模式4MB块
        maxConcurrentChunks: speedMode ? 10 : 6, // 速度模式10并发
        timeout: 180000, // 延长超时
        retryAttempts: speedMode ? 0 : 1,
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
    console.log('[File] Begin file/url transcription');
    const filePath = request.content;
    // 生成稳定的缓存键：优先使用 R2 对象键；否则使用去除查询参数后的 URL 作为键
    const fileHash = this.deriveCacheKeyForFile(filePath, request.options?.r2Key);
    
    // 检查缓存
    const cachedEntry = await transcriptionCache.get('user_file', fileHash + this.variantSuffix(request.options), request.options?.userId);
    console.log('[File] Cache lookup key=%s hit=%s', fileHash, !!cachedEntry);
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
      // Report transcription start
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'transcribe',
          percentage: 10,
          message: 'Starting transcription...',
          estimatedTime: '~30s' // 文件已上传，估算30秒转录时间
        });
      }

      // 进行转录（根据用户等级选择模型）
      const transcription = await this.time('model.transcribe', this.transcriptionService.transcribeAudio(filePath, {
        language: request.options?.language || 'auto',
        userTier: request.options?.userTier, // 传递用户等级信息
        fallbackEnabled: request.options?.fallbackEnabled,
        outputFormat: request.options?.outputFormat || 'json',
        highAccuracyMode: request.options?.highAccuracyMode
      }));

      // 可选：为 PRO 用户叠加话者分离（Deepgram）
      const enableOverlayFile = !!request.options?.enableDiarizationAfterWhisper && request.options?.userTier === 'pro';
      if (enableOverlayFile) {
        try { await this.transcriptionService.addDiarizationFromUrl(filePath, transcription); } catch {}
      }

      // Report processing phase
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'transcribe',
          percentage: 50,
          message: 'Processing audio...',
          estimatedTime: '~15s'
        });
      }

      // 本地中文规范化（如适用）+ 英文术语修复 + 可选LLM标点增强
      try {
        const { isChineseLangOrText } = await import('./refine-local');
        const isZh = isChineseLangOrText(transcription.language, transcription.text);
        if (isZh) {
          const changed = localPunctuateSegmentsIfChinese(transcription.segments as any, transcription.language);
          if (changed) console.log(`[Punct] file_upload.segments normalized: ${changed}`);
          let t = changed
            ? rebuildTextFromSegments(transcription.segments as any)
            : localChinesePunctuate(transcription.text || '');
          try {
            const llm = await punctuateTextLLM(t, { language: 'zh' });
            if (llm) { console.log('[Punct][LLM] file_upload applied'); t = llm; }
          } catch {}
          fixLatinNoiseInSegments(transcription.segments as any);
          const finalText = fixLatinNoise(t);
          if (finalText !== t) console.log('[Punct] file_upload.lexicon fixed');
          transcription.text = finalText;
        }
      } catch {}

      // 对齐最终文本句子到模型时间戳
      try {
        transcription.segments = alignSentencesWithSegments(
          transcription.text,
          transcription.segments as any,
          transcription.language
        );
        (transcription as any).srtText = undefined;
      } catch {}

      // Report formatting phase
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'process',
          percentage: 85,
          message: 'Generating formats...',
          estimatedTime: '~5s'
        });
      }

      // 估算成本
      const estimatedCost = this.transcriptionService.estimateCost(transcription.duration);

      // 生成不同格式（为上传文件使用原始文件名作为标题）
      const formats = await this.time('formats.generate', this.generateFormats(transcription, (request.options as any)?.fileName || 'uploaded file'));

      // 缓存结果（保存处理后的文本）
      await this.time('cache.set', transcriptionCache.set(
        'user_file',
        fileHash + this.variantSuffix(request.options),
        transcription,
        formats,
        {
          userTier: request.options?.userTier,
          fileName: (request.options as any)?.fileName
        },
        { userId: request.options?.userId }
      ));

      // 写入数据库（仅登录用户）
      let jobId: string | undefined;
      if (request.options?.userId) {
        try {
          const { createOrReuseTranscription, upsertTranscriptionFormats } = await import("@/models/transcription");
          jobId = crypto.randomUUID();
          const row = await this.time('db.write', createOrReuseTranscription({
            job_id: jobId,
            user_uuid: request.options?.userId || "",
            source_type: 'file_upload',
            source_hash: fileHash + this.variantSuffix(request.options),
            source_url: filePath,
            title: (request.options as any)?.fileName || 'uploaded file',
            language: transcription.language,
            duration_sec: transcription.duration,
            cost_minutes: Math.ceil(transcription.duration/60),
            status: 'completed'
          }));
          jobId = (row as any).job_id || jobId;
          if (jobId) {
            await this.time('db.write_formats', upsertTranscriptionFormats(jobId, formats));
          }
        } catch(e) {
          // ignore
        }
      }

      // Report completion
      if (request.options?.onProgress) {
        request.options.onProgress({
          stage: 'process',
          percentage: 100,
          message: 'Completed',
          estimatedTime: '0s'
        });
      }

      return {
        success: true,
        data: {
          transcription,
          formats,
          jobId,
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
      console.log('[Preview][YouTube] Full transcription cache present, extracting preview');
      const preview = await this.extractPreview(cachedEntry.transcriptionData, cachedEntry.formats);
      return {
        success: true,
        preview
      };
    }

    // 获取视频信息
    console.log('[Preview][YouTube] Fetching video info');
    const videoInfo = await YouTubeService.getVideoInfo(videoId);
    
    // 如果有字幕，尝试快速生成预览
    if (videoInfo.captions && videoInfo.captions.length > 0) {
      const bestCaption = YouTubeService.selectBestCaption(videoInfo.captions);
      if (bestCaption) {
        console.log('[Preview][YouTube] Trying caption for preview:', bestCaption.languageCode);
        const captionText = await YouTubeService.downloadCaption(bestCaption.url);
        const captionSRT = await YouTubeService.convertCaptionToSRT(bestCaption.url);
        
        // 检查字幕内容是否为空
        if (captionText && captionText.trim().length > 0) {
          // 字幕有内容，使用字幕预览
          console.log('[Preview][YouTube] Using caption preview (text length:', captionText.length, ')');
          
          // 检测是否为中文内容并应用LLM润色
          let processedText = captionText;
          try {
            const isZh = (bestCaption.languageCode || '').toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(captionText);
            if (isZh) {
              console.log('[Preview][YouTube] Detected Chinese caption, applying LLM refinement');
              // 先截取预览长度，然后润色
              const previewText = this.truncateText(captionText, 90);
              const refined = await punctuateTextLLM(previewText, { 
                language: 'zh',
                isPreview: true,
                maxTokens: 500
              } as any);
              if (refined) {
                console.log('[Preview][YouTube] Caption LLM refinement applied successfully');
                processedText = refined;
              }
            }
          } catch (error) {
            console.warn('[Preview][YouTube] Caption LLM refinement failed:', error);
          }
          
          const preview = {
            text: this.truncateText(processedText, 90),
            srt: this.truncateSRT(captionSRT, 90),
            duration: 90
          };
          return { success: true, preview };
        } else {
          // 字幕为空，记录并继续到音频预览
          console.log('[Preview][YouTube] Caption empty, will try audio preview fallback');
        }
      }
    }

    // 如果没有字幕或字幕为空，尝试进行音频转录生成预览（使用降级机制）
    // 但是对于未登录用户，我们应该限制这个功能避免成本过高
    const isAuthenticated = request.options?.userId ? true : false;
    
    // 如果未登录，根据开关决定是否允许匿名预览
    const allowAnonPreview = process.env.PREVIEW_ALLOW_ANON === '1' || process.env.PREVIEW_ALLOW_ANON === 'true';
    if (!isAuthenticated && !allowAnonPreview) {
      console.log('[Preview][YouTube] Unauthenticated user - audio preview disabled by config');
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
      console.log('[Preview][YouTube] Anonymous preview allowed by PREVIEW_ALLOW_ANON=true');
    }
    
    try {
      console.log('[Preview][YouTube] Starting audio transcription fallback...');
      
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
      const preview = await this.extractPreview(transcription, {
        txt: transcription.text,
        srt: this.transcriptionService.convertToSRT(transcription)
      });

      console.log('[Preview][YouTube] Audio preview generated successfully');
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

      const preview = await this.extractPreview(transcription, {
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
  async probeLanguageFromUrl(audioUrl: string, options?: { userTier?: string; languageProbeSeconds?: number; startOffset?: number }): Promise<{ language: string; isChinese: boolean }> {
    // One quick attempt (8–10s), then a single retry (12s) if result unknown/failed.
    const attempt = async (sec: number, offset: number = 0) => {
      console.log(`[Probe] Start creating ${sec}s WAV clip for language detection (offset: ${offset}s)`);
      const { createWavClipFromUrl } = await import('./audio-clip');
      // 使用偏移量来跳过视频开头（可能有音乐或静音）
      const wavClip = await createWavClipFromUrl(audioUrl, sec, offset);
      const uploaded = await this.r2Service.uploadFile(
        wavClip,
        `probe_${Date.now()}_${sec}_${offset}.wav`,
        'audio/wav',
        { folder: 'probe-clips', expiresIn: 1, makePublic: true }
      );
      try {
        const res = await this.transcriptionService.probeLanguage(uploaded.url, { userTier: options?.userTier } as any);
        console.log('[Probe] Deepgram result:', res);
        return res;
      } finally {
        setTimeout(() => this.r2Service.deleteFile(uploaded.key).catch(() => {}), 30000);
      }
    };

    try {
      const firstSec = Math.max(8, Math.min(10, options?.languageProbeSeconds || 10));
      // 第一次尝试：从开头开始
      const res1 = await attempt(firstSec, 0);
      if (res1.isChinese || (res1.language !== 'unknown' && res1.language !== 'en' && res1.language !== 'nl')) {
        return res1;
      }
      
      // 第二次尝试：跳过前30秒（避开可能的片头音乐）
      console.log('[Probe] First attempt inconclusive, trying with 30s offset...');
      const res2 = await attempt(12, 30);
      if (res2.isChinese || res2.language === 'zh') {
        return res2;
      }
      
      // 第三次尝试：如果前两次都失败，尝试90秒位置（跳过1分30秒的片头音乐）
      if (!res2.isChinese && res2.language !== 'zh') {
        console.log('[Probe] Second attempt still inconclusive, trying with 90s offset...');
        const res3 = await attempt(15, 90);
        if (res3.isChinese || res3.language === 'zh') {
          return res3;
        }
        
        // 第四次尝试：如果还是失败，尝试120秒位置（2分钟）
        if (!res3.isChinese && res3.language !== 'zh') {
          console.log('[Probe] Third attempt failed, trying with 120s offset...');
          const res4 = await attempt(15, 120);
          if (res4.isChinese || res4.language === 'zh') {
            return res4;
          }
          
          // 返回最有可能准确的结果
          if (res4.language !== 'unknown') return res4;
          if (res3.language !== 'unknown') return res3;
        }
        
        // 如果所有尝试都失败，返回最后的结果
        if (res3.language !== 'unknown') return res3;
        if (res2.language !== 'unknown') return res2;
        if (res1.language !== 'unknown') return res1;
      }
      
      return res2;
    } catch (e) {
      console.warn('Language probe failed:', e);
      return { language: 'unknown', isChinese: false };
    }
  }

  /**
   * 从完整转录中提取预览
   */
  private async extractPreview(transcription: TranscriptionResult, formats: Record<string, string>): Promise<NonNullable<TranscriptionResponse['preview']>> {
    // 使用优化后的标点符号处理
    let optimizedText = this.transcriptionService.convertToPlainText(transcription);
    
    // 检测是否为中文内容并应用LLM润色
    try {
      const isZh = (transcription.language || '').toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(optimizedText);
      if (isZh) {
        console.log('[Preview] Detected Chinese content, applying LLM refinement for preview');
        // 先截取预览长度，然后润色（避免处理过长文本）
        const previewText = this.truncateText(optimizedText, 90);
        
        // 应用LLM润色，使用预览专用配置（限制token数量）
        const refined = await punctuateTextLLM(previewText, { 
          language: 'zh',
          isPreview: true,  // 标记为预览，可能使用更快的模型或更低的token限制
          maxTokens: 500    // 限制token数量以加快处理速度
        } as any);
        
        if (refined) {
          console.log('[Preview] LLM refinement applied successfully');
          optimizedText = refined;
        }
      }
    } catch (error) {
      console.warn('[Preview] LLM refinement failed, using original text:', error);
      // 失败时使用原始文本，不影响预览生成
    }
    
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
