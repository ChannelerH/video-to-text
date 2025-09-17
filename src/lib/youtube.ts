import ytdl from '@distube/ytdl-core';
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

export interface VideoInfo {
  videoId: string;
  title: string;
  duration: number;
  thumbnails: string[];
  captions?: Caption[];
}

export interface Caption {
  languageCode: string;
  name: string;
  url: string;
  isAutomatic: boolean;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes?: number;
  percentage?: number;
  speed: number; // bytes per second
  eta?: number; // estimated time remaining in seconds
  chunkIndex?: number;
  totalChunks?: number;
}

export interface DownloadOptions {
  enableParallelDownload?: boolean;
  chunkSize?: number; // bytes
  maxConcurrentChunks?: number;
  timeout?: number; // milliseconds
  retryAttempts?: number;
  retryDelay?: number; // milliseconds
  cdnProxy?: string;
  onProgress?: (progress: DownloadProgress) => void;
  onError?: (error: Error) => void;
}

export interface OptimizedAudioFormat {
  itag: number;
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
  quality: string;
  audioQuality: string;
  approxDurationMs: number;
  supportsRangeRequests?: boolean;
  isDrc?: boolean; // 是否使用了动态范围压缩
}

export interface AudioTrackInfo {
  languageCode: string;
  trackType: 'original' | 'dubbed-auto';
  displayName: string;
  formats: number; // 可用格式数量
}

export class YouTubeService {
  /**
   * 验证并解析 YouTube URL
   */
  static validateAndParseUrl(url: string): string | null {
    try {
      const videoId = ytdl.getVideoID(url);
      return videoId;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检测视频的可用音轨语言
   */
  static async detectAudioTracks(videoId: string): Promise<AudioTrackInfo[]> {
    try {
      const info = await ytdl.getInfo(videoId);
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      const tracks = new Map<string, AudioTrackInfo>();
      
      audioFormats.forEach(format => {
        if (format.url) {
          try {
            const url = new URL(format.url);
            const xtags = url.searchParams.get('xtags');
            
            if (xtags) {
              const langMatch = xtags.match(/lang=([a-z]{2}(-[A-Z]{2})?)/i);
              const typeMatch = xtags.match(/acont=(original|dubbed-auto)/i);
              
              if (langMatch) {
                const languageCode = langMatch[1];
                const trackType = (typeMatch ? typeMatch[1] : 'original') as 'original' | 'dubbed-auto';
                const key = `${languageCode}_${trackType}`;
                
                if (!tracks.has(key)) {
                  // 生成显示名称
                  const languageNames: Record<string, string> = {
                    'en-US': 'English (US)',
                    'en': 'English',
                    'zh-CN': 'Chinese (Simplified)',
                    'zh-TW': 'Chinese (Traditional)',
                    'es-US': 'Spanish (US)',
                    'es': 'Spanish',
                    'fr-FR': 'French',
                    'de-DE': 'German',
                    'ja': 'Japanese',
                    'ko': 'Korean',
                    'pt-BR': 'Portuguese (Brazil)',
                    'ru': 'Russian',
                    'it': 'Italian',
                    'pl': 'Polish',
                    'pl-PL': 'Polish',
                    'hi': 'Hindi',
                    'id': 'Indonesian'
                  };
                  
                  const baseName = languageNames[languageCode] || languageCode;
                  const displayName = trackType === 'dubbed-auto' 
                    ? `${baseName} (AI Dubbed)` 
                    : `${baseName} (Original)`;
                  
                  tracks.set(key, {
                    languageCode,
                    trackType,
                    displayName,
                    formats: 1
                  });
                } else {
                  tracks.get(key)!.formats++;
                }
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      });
      
      // 按原始音轨优先，然后按语言代码排序
      return Array.from(tracks.values()).sort((a, b) => {
        if (a.trackType !== b.trackType) {
          return a.trackType === 'original' ? -1 : 1;
        }
        return a.languageCode.localeCompare(b.languageCode);
      });
    } catch (error) {
      console.error('Error detecting audio tracks:', error);
      return [];
    }
  }

  /**
   * 获取视频信息和字幕
   */
  static async getVideoInfo(videoId: string, retryCount = 0): Promise<VideoInfo> {
    // 速度优化：减少重试次数和延迟
    const maxRetries = process.env.YOUTUBE_SPEED_MODE === 'true' ? 1 : 2; // 速度模式只重试1次
    const baseDelay = 500; // 500ms基础延迟（原为1秒）
    
    try {
      
      const info = await ytdl.getInfo(videoId, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        }
      });
      
      const videoDetails = info.videoDetails;

      // 提取字幕信息
      const captions: Caption[] = [];
      if (info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        const tracks = info.player_response.captions.playerCaptionsTracklistRenderer.captionTracks;
        
        for (const track of tracks) {
          captions.push({
            languageCode: track.languageCode,
            name: track.name?.simpleText || track.languageCode,
            url: track.baseUrl,
            isAutomatic: track.kind === 'asr'
          });
        }
      }

      const videoInfo: VideoInfo = {
        videoId,
        title: videoDetails.title,
        duration: parseInt(videoDetails.lengthSeconds),
        thumbnails: videoDetails.thumbnails?.map((t: any) => t.url) || [],
        captions: captions.length > 0 ? captions : undefined
      };
      
      return videoInfo;
    } catch (error: any) {
      console.error(`Error getting video info (attempt ${retryCount + 1}):`, {
        error: error.message,
        code: error.code,
        errno: error.errno
      });
      
      // 检查是否是网络错误且还有重试机会
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ENOTFOUND' || 
                            error.code === 'ETIMEDOUT' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('read ECONNRESET') ||
                            error.message?.includes('No playable formats found');
      
      if (isNetworkError && retryCount < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(1.5, retryCount), 2000); // 更快的重试，最多2秒
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getVideoInfo(videoId, retryCount + 1);
      }
      
      throw new Error(`Failed to get video info after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  /**
   * 下载字幕
   */
  static async downloadCaption(captionUrl: string): Promise<string> {
    try {
      const xmlContent = await this.fetchCaptionXML(captionUrl);
      const textContent = this.parseXMLCaptions(xmlContent);
      return textContent;
    } catch (error) {
      console.error('Error downloading caption:', error);
      throw new Error('Failed to download caption');
    }
  }

  /**
   * 获取音频流 URL（用于转录）
   * 包含增强的重试机制处理 ECONNRESET 错误
   * @param videoId YouTube视频ID
   * @param preferredLanguage 偏好的音轨语言代码（如 'en-US', 'zh-CN' 等）
   * @param retryCount 重试次数
   */
  static async getAudioStreamUrl(videoId: string, preferredLanguage?: string, retryCount = 0): Promise<string> {
    const maxRetries = 3;
    const baseDelay = 1000;
    
    try {
      
      // 添加 User-Agent 和其他请求头来避免被封
      const info = await ytdl.getInfo(videoId, {
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        }
      });
      
      // 选择最佳音频格式 - 智能选择主音轨
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // 检测多语言音轨
      const languageTracks = new Map<string, any[]>();
      audioFormats.forEach(format => {
        if (format.url) {
          try {
            const url = new URL(format.url);
            const xtags = url.searchParams.get('xtags');
            
            // 解析 xtags 中的语言信息
            // 格式: "acont=original:lang=en-US" 或 "acont=dubbed-auto:lang=fr-FR"
            let languageCode = 'default';
            let trackType = 'original';
            
            if (xtags) {
              const langMatch = xtags.match(/lang=([a-z]{2}(-[A-Z]{2})?)/i);
              const typeMatch = xtags.match(/acont=(original|dubbed-auto)/i);
              
              if (langMatch) {
                languageCode = langMatch[1];
              }
              if (typeMatch) {
                trackType = typeMatch[1];
              }
            }
            
            const trackKey = `${languageCode}_${trackType}`;
            if (!languageTracks.has(trackKey)) {
              languageTracks.set(trackKey, []);
            }
            languageTracks.get(trackKey)!.push({
              ...format,
              languageCode,
              trackType
            });
            
          } catch (e) {
            // URL 解析失败，使用默认分组
            if (!languageTracks.has('default_original')) {
              languageTracks.set('default_original', []);
            }
            languageTracks.get('default_original')!.push(format);
          }
        }
      });
      
      
      const drcFormats = audioFormats.filter(f => f.isDrc === true);
      const nonDrcFormats = audioFormats.filter(f => !f.isDrc);

      // 智能音轨选择策略（考虑语言偏好）
      let bestFormat: any = null;
      
      // 如果指定了语言偏好
      if (preferredLanguage && languageTracks.size > 1) {
        // 先找原始音轨的指定语言
        const preferredOriginalKey = `${preferredLanguage}_original`;
        const preferredDubbedKey = `${preferredLanguage}_dubbed-auto`;
        
        // 处理语言代码兼容性（如 'pl' 匹配 'pl-PL'）
        let candidateFormats = 
          languageTracks.get(preferredOriginalKey) || 
          languageTracks.get(preferredDubbedKey) ||
          [];
        
        // 如果没找到，尝试匹配带区域码的版本（如 pl -> pl-PL）
        if (candidateFormats.length === 0 && !preferredLanguage.includes('-')) {
          // 遍历所有音轨，找到语言代码开头匹配的
          for (const [key, formats] of languageTracks) {
            if (key.startsWith(`${preferredLanguage}-`) && key.endsWith('_original')) {
              candidateFormats = formats;
              break;
            }
          }
          // 如果还没找到原始音轨，尝试配音音轨
          if (candidateFormats.length === 0) {
            for (const [key, formats] of languageTracks) {
              if (key.startsWith(`${preferredLanguage}-`) && key.endsWith('_dubbed-auto')) {
                candidateFormats = formats;
                break;
              }
            }
          }
        }
        
        if (candidateFormats.length > 0) {
          // 在候选格式中选择最佳
          bestFormat = candidateFormats.find(format => 
            format.itag === 140 && format.url && !format.isDrc
          ) || candidateFormats.find(format =>
            format.url && !format.isDrc
          );
        }
      }
      
      // 如果没有找到偏好语言，或没有指定语言，使用原始策略
      if (!bestFormat) {
        // 如果用户明确选择了语言但没找到，记录日志
        if (preferredLanguage) {
          console.log(`[YouTube] Preferred language '${preferredLanguage}' not found in available tracks. Available tracks:`, 
            Array.from(languageTracks.keys()));
        }
        
        // 优先选择原始英文音轨
        const originalTracks = languageTracks.get('en-US_original') || 
                              languageTracks.get('en_original') ||
                              languageTracks.get('default_original') ||
                              [];
        
        if (originalTracks.length > 0) {
          bestFormat = originalTracks.find(format => 
            format.itag === 140 && format.url && !format.isDrc
          );
        }
        
        // 如果还是没有，使用原始的选择逻辑
        if (!bestFormat) {
          bestFormat = audioFormats.find(format => 
            format.itag === 140 && // 标准 AAC 128k 格式
            format.url && 
            !format.isDrc // 非DRC版本（原始音轨）
          );
        }
      }


      // 如果没有找到理想的格式，尝试其他非DRC格式
      if (!bestFormat) {
        bestFormat = audioFormats.find(format =>
          format.url &&
          format.audioBitrate && 
          format.audioBitrate >= 96 && // 至少96kbps保证质量
          !format.isDrc // 非DRC版本
        );
      }

      // 如果还是没有，选择任何非DRC的音频
      if (!bestFormat) {
        bestFormat = audioFormats.find(format => 
          format.url && !format.isDrc
        );
      }

      // 最后的备选：选择最高质量的音频（即使是DRC）
      if (!bestFormat) {
        bestFormat = audioFormats
          .filter(format => format.url && format.audioBitrate)
          .sort((a, b) => {
            // 优先选择标准格式
            if (a.itag === 140 && b.itag !== 140) return -1;
            if (b.itag === 140 && a.itag !== 140) return 1;
            // 然后按比特率排序
            const aQuality = parseInt(String(a.audioBitrate || '0'));
            const bQuality = parseInt(String(b.audioBitrate || '0'));
            return bQuality - aQuality;
          })[0];
      }

      if (!bestFormat || !bestFormat.url) {
        throw new Error('No valid audio format found');
      }

      return bestFormat.url;
    } catch (error: any) {
      console.error(`Error getting audio stream (attempt ${retryCount + 1}):`, {
        error: error.message,
        code: error.code,
        errno: error.errno
      });
      
      // 检查是否是网络错误且还有重试机会
      const isNetworkError = error.code === 'ECONNRESET' || 
                            error.code === 'ENOTFOUND' || 
                            error.code === 'ETIMEDOUT' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('read ECONNRESET');
      
      if (isNetworkError && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // 指数退避
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getAudioStreamUrl(videoId, preferredLanguage, retryCount + 1);
      }
      
      throw new Error(`Failed to get audio stream after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  /**
   * 获取优化的音频格式列表（用于快速下载）
   */
  static async getOptimizedAudioFormats(videoId: string, preferredLanguage?: string): Promise<OptimizedAudioFormat[]> {
    try {
      const info = await ytdl.getInfo(videoId);
      let audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      // 如果指定了语言偏好，优先筛选该语言的音轨
      if (preferredLanguage && audioFormats.length > 0) {
        const preferredFormats = audioFormats.filter(format => {
          if (format.url) {
            try {
              const url = new URL(format.url);
              const xtags = url.searchParams.get('xtags');
              if (xtags) {
                // 处理语言代码兼容性
                const hasExactMatch = xtags.includes(`lang=${preferredLanguage}`);
                const hasPartialMatch = !preferredLanguage.includes('-') && 
                  new RegExp(`lang=${preferredLanguage}-[A-Z]{2}`, 'i').test(xtags);
                return hasExactMatch || hasPartialMatch;
              }
            } catch (e) {
              // URL解析失败，忽略
            }
          }
          return false;
        });
        
        // 如果找到了偏好语言的格式，使用它们；否则使用所有格式
        if (preferredFormats.length > 0) {
          audioFormats = preferredFormats;
          console.log(`[YouTube] Found ${preferredFormats.length} audio formats for language: ${preferredLanguage}`);
        } else {
          console.log(`[YouTube] No audio formats found for language: ${preferredLanguage}, using all formats`);
        }
      }
      
      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // 转换为优化格式并排序
      const optimizedFormats: OptimizedAudioFormat[] = audioFormats
        .map(format => ({
          itag: format.itag,
          url: format.url,
          mimeType: format.mimeType || 'audio/unknown',
          bitrate: format.audioBitrate || 0,
          contentLength: format.contentLength ? parseInt(format.contentLength) : undefined,
          quality: format.quality || 'unknown',
          audioQuality: format.audioQuality || 'unknown',
          approxDurationMs: parseInt(format.approxDurationMs || '0'),
          supportsRangeRequests: format.hasAudio && !format.isLive,
          isDrc: format.isDrc || false // 添加 DRC 信息
        }))
        .filter(format => format.bitrate > 0) // 过滤无效格式
        .sort((a, b) => {
          // 优先选择适合转录的格式：
          // 1. 优先选择非DRC格式（原始音轨）
          // 2. 保证音频质量足够用于转录（至少64kbps）
          // 3. 优先选择支持范围请求的格式（可以并行下载）
          
          // 首先按DRC状态排序（非DRC优先）
          if (a.isDrc !== b.isDrc) {
            return a.isDrc ? 1 : -1; // 非DRC排在前面
          }
          
          const minBitrate = 64; // 转录最低要求
          const aValidBitrate = a.bitrate >= minBitrate ? a.bitrate : 999999;
          const bValidBitrate = b.bitrate >= minBitrate ? b.bitrate : 999999;
          
          // 优先选择支持范围请求的格式
          if (a.supportsRangeRequests !== b.supportsRangeRequests) {
            return b.supportsRangeRequests ? 1 : -1;
          }
          
          // 然后按文件大小排序（越小越好，下载更快）
          if (a.contentLength && b.contentLength) {
            return a.contentLength - b.contentLength;
          }
          
          // 最后按比特率排序（选择合适的质量）
          return aValidBitrate - bValidBitrate;
        });

      return optimizedFormats;
    } catch (error) {
      console.error('Error getting optimized audio formats:', error);
      throw new Error('Failed to get optimized audio formats');
    }
  }

  /**
   * 选择最佳音频格式用于快速下载
   */
  static async selectOptimizedAudioFormat(videoId: string, options?: { preferSmallSize?: boolean }): Promise<OptimizedAudioFormat> {
    const formats = await this.getOptimizedAudioFormats(videoId);
    
    if (formats.length === 0) {
      throw new Error('No suitable audio formats found');
    }

    // 优先选择非DRC格式（原始音轨）
    const nonDrcFormats = formats.filter(f => !f.isDrc);
    const availableFormats = nonDrcFormats.length > 0 ? nonDrcFormats : formats;

    // 如果偏好小文件，选择第一个（已按大小排序）
    if (options?.preferSmallSize) {
      return availableFormats[0];
    }

    // 否则选择质量和大小的平衡，优先选择非DRC格式
    const balancedFormat = availableFormats.find(f => 
      f.bitrate >= 96 && f.bitrate <= 128 && f.supportsRangeRequests && !f.isDrc
    ) || availableFormats.find(f => 
      f.bitrate >= 96 && f.bitrate <= 128 && f.supportsRangeRequests
    ) || availableFormats[0];

    return balancedFormat;
  }

  /**
   * 流式下载音频（优化版本）
   */
  static async downloadAudioStreamOptimized(
    videoId: string, 
    options: DownloadOptions = {}
  ): Promise<Buffer> {
    const {
      enableParallelDownload = true,
      chunkSize = 1024 * 1024, // 1MB chunks
      maxConcurrentChunks = 4,
      timeout = 60000,
      retryAttempts = 1,
      retryDelay = 1000,
      cdnProxy,
      onProgress,
      onError
    } = options;

    try {
      // 获取最优音频格式：为保证识别准确率，优先选择较高比特率
      const audioFormat = await this.selectOptimizedAudioFormat(videoId, { 
        preferSmallSize: false 
      });


      let audioUrl = audioFormat.url;
      
      // 使用CDN代理（如果提供）
      if (cdnProxy) {
        audioUrl = this.applyCdnProxy(audioUrl, cdnProxy);
      }

      // 检查是否支持并行下载
      if (enableParallelDownload && audioFormat.supportsRangeRequests && audioFormat.contentLength) {
        return await this.downloadWithParallelChunks(
          audioUrl, 
          audioFormat.contentLength, 
          {
            chunkSize,
            maxConcurrentChunks,
            timeout,
            retryAttempts,
            retryDelay,
            onProgress,
            onError
          }
        );
      } else {
        // 使用标准流式下载
        return await this.downloadWithStream(audioUrl, {
          timeout,
          retryAttempts,
          retryDelay,
          onProgress,
          onError,
          totalSize: audioFormat.contentLength
        });
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }

  /**
   * 并行分块下载
   */
  private static async downloadWithParallelChunks(
    url: string,
    totalSize: number,
    options: {
      chunkSize: number;
      maxConcurrentChunks: number;
      timeout: number;
      retryAttempts: number;
      retryDelay: number;
      onProgress?: (progress: DownloadProgress) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<Buffer> {
    const { chunkSize, maxConcurrentChunks, timeout, retryAttempts, retryDelay, onProgress, onError } = options;
    
    const chunks: Buffer[] = [];
    const totalChunks = Math.ceil(totalSize / chunkSize);
    let completedChunks = 0;
    let bytesDownloaded = 0;
    const startTime = Date.now();


    // 创建分块任务
    const chunkTasks: Promise<{ index: number; buffer: Buffer }>[] = [];
    
    for (let i = 0; i < totalChunks; i += maxConcurrentChunks) {
      const batch = [];
      
      for (let j = 0; j < maxConcurrentChunks && i + j < totalChunks; j++) {
        const chunkIndex = i + j;
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize - 1, totalSize - 1);
        
        const chunkTask = this.downloadChunkWithRetry(
          url, 
          start, 
          end, 
          chunkIndex, 
          timeout, 
          retryAttempts, 
          retryDelay
        ).then(buffer => {
          completedChunks++;
          bytesDownloaded += buffer.length;
          
          // 报告进度
          if (onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = bytesDownloaded / elapsed;
            const eta = (totalSize - bytesDownloaded) / speed;
            
            onProgress({
              bytesDownloaded,
              totalBytes: totalSize,
              percentage: Math.round((bytesDownloaded / totalSize) * 100),
              speed: Math.round(speed),
              eta: Math.round(eta),
              chunkIndex: completedChunks,
              totalChunks
            });
          }
          
          return { index: chunkIndex, buffer };
        }).catch(error => {
          if (onError) {
            onError(new Error(`Chunk ${chunkIndex} failed: ${error.message}`));
          }
          throw error;
        });
        
        batch.push(chunkTask);
      }
      
      // 等待当前批次完成
      const batchResults = await Promise.all(batch);
      chunkTasks.push(...batchResults.map(r => Promise.resolve(r)));
    }

    // 收集所有分块结果
    const results = await Promise.all(chunkTasks);
    
    // 按索引排序并合并
    results.sort((a, b) => a.index - b.index);
    const finalBuffer = Buffer.concat(results.map(r => r.buffer));
    
    
    return finalBuffer;
  }

  /**
   * 下载单个分块（带重试）
   */
  private static async downloadChunkWithRetry(
    url: string,
    start: number,
    end: number,
    chunkIndex: number,
    timeout: number,
    retryAttempts: number,
    retryDelay: number
  ): Promise<Buffer> {
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          headers: {
            'Range': `bytes=${start}-${end}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (response.status === 206 || response.status === 200) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } else {
          throw new Error(`Unexpected status code: ${response.status}`);
        }
      } catch (error) {
        
        if (attempt === retryAttempts) {
          throw error;
        }
        
        // 指数退避延迟
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Failed to download chunk ${chunkIndex} after ${retryAttempts} attempts`);
  }

  /**
   * 标准流式下载
   */
  private static async downloadWithStream(
    url: string,
    options: {
      timeout: number;
      retryAttempts: number;
      retryDelay: number;
      onProgress?: (progress: DownloadProgress) => void;
      onError?: (error: Error) => void;
      totalSize?: number;
    }
  ): Promise<Buffer> {
    const { timeout, retryAttempts, retryDelay, onProgress, onError, totalSize } = options;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const chunks: Buffer[] = [];
        let bytesDownloaded = 0;
        const startTime = Date.now();
        const contentLength = totalSize || (response.headers.get('content-length') ? parseInt(response.headers.get('content-length')!) : undefined);

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = Buffer.from(value);
            chunks.push(chunk);
            bytesDownloaded += chunk.length;

            // 报告进度
            if (onProgress) {
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = bytesDownloaded / elapsed;
              
              onProgress({
                bytesDownloaded,
                totalBytes: contentLength,
                percentage: contentLength ? Math.round((bytesDownloaded / contentLength) * 100) : undefined,
                speed: Math.round(speed),
                eta: contentLength ? Math.round((contentLength - bytesDownloaded) / speed) : undefined
              });
            }
          }
        } finally {
          reader.releaseLock();
        }

        return Buffer.concat(chunks);
      } catch (error) {
        
        if (attempt === retryAttempts) {
          if (onError) {
            onError(error as Error);
          }
          throw error;
        }
        
        // 指数退避延迟
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Failed to download after ${retryAttempts} attempts`);
  }

  /**
   * 应用CDN代理
   */
  private static applyCdnProxy(url: string, cdnProxy: string): string {
    try {
      const originalUrl = new URL(url);
      const proxyUrl = new URL(cdnProxy);
      
      // 将原始URL作为查询参数传递给代理
      proxyUrl.searchParams.set('url', encodeURIComponent(url));
      
      return proxyUrl.toString();
    } catch (error) {
      console.warn('Failed to apply CDN proxy, using original URL:', error);
      return url;
    }
  }

  /**
   * 使用ytdl-core流式下载（备用方法）
   */
  static async downloadAudioWithYtdlStream(videoId: string, options: DownloadOptions = {}): Promise<Buffer> {
    const {
      timeout = 60000,
      retryAttempts = 3,
      retryDelay = 1000,
      onProgress,
      onError
    } = options;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {

        const info = await ytdl.getInfo(videoId);
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        
        if (audioFormats.length === 0) {
          throw new Error('No audio formats available');
        }

        // 选择最小的高质量格式用于快速下载
        const bestFormat = audioFormats
          .filter(f => f.audioBitrate && f.audioBitrate >= 64) // 最低64kbps用于转录
          .sort((a, b) => {
            const aSize = parseInt(a.contentLength || '999999999');
            const bSize = parseInt(b.contentLength || '999999999');
            return aSize - bSize; // 选择最小文件
          })[0] || audioFormats[0];


        const audioStream = ytdl(videoId, {
          format: bestFormat,
          quality: 'lowestaudio', // 优先选择最小音频用于快速下载
        });

        const chunks: Buffer[] = [];
        let bytesDownloaded = 0;
        const startTime = Date.now();
        const totalSize = bestFormat.contentLength ? parseInt(bestFormat.contentLength) : undefined;

        // 设置超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Download timeout')), timeout);
        });

        const downloadPromise = new Promise<Buffer>((resolve, reject) => {
          audioStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            bytesDownloaded += chunk.length;

            // 报告进度
            if (onProgress) {
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = bytesDownloaded / elapsed;

              onProgress({
                bytesDownloaded,
                totalBytes: totalSize,
                percentage: totalSize ? Math.round((bytesDownloaded / totalSize) * 100) : undefined,
                speed: Math.round(speed),
                eta: totalSize ? Math.round((totalSize - bytesDownloaded) / speed) : undefined
              });
            }
          });

          audioStream.on('end', () => {
            const finalBuffer = Buffer.concat(chunks);
            resolve(finalBuffer);
          });

          audioStream.on('error', (error) => {
            reject(error);
          });
        });

        return await Promise.race([downloadPromise, timeoutPromise]);
      } catch (error) {
        
        if (attempt === retryAttempts) {
          if (onError) {
            onError(error as Error);
          }
          throw error;
        }
        
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Failed to download with ytdl-core after ${retryAttempts} attempts`);
  }

  /**
   * 仅下载前 N 秒音频片段用于语言探针（尽量小且快速）
   */
  static async downloadAudioClip(videoId: string, seconds: number = 10): Promise<Buffer> {
    const clipSeconds = Math.max(5, Math.min(20, Math.floor(seconds)));
    const info = await ytdl.getInfo(videoId);
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    if (audioFormats.length === 0) {
      throw new Error('No audio formats available');
    }
    // 选择更小的音频格式以尽快取得片段
    const bestFormat = audioFormats
      .filter(f => f.audioBitrate && f.audioBitrate >= 48)
      .sort((a, b) => {
        const aSize = parseInt(a.contentLength || '999999999');
        const bSize = parseInt(b.contentLength || '999999999');
        return aSize - bSize;
      })[0] || audioFormats[0];

    const bitrateKbps = bestFormat.audioBitrate || 96; // 近似值
    const bytesPerSecond = (bitrateKbps * 1000) / 8; // kbps -> bytes/s
    const targetBytes = Math.floor(bytesPerSecond * clipSeconds * 1.2); // 20% 裕量

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const stream = ytdl(videoId, { format: bestFormat, quality: 'lowestaudio' });
        const chunks: Buffer[] = [];
        let downloaded = 0;

        const finalize = () => {
          try {
            stream.removeAllListeners();
          } catch {}
          resolve(Buffer.concat(chunks));
        };

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          downloaded += chunk.length;
          if (downloaded >= targetBytes) {
            try { stream.destroy(); } catch {}
            finalize();
          }
        });
        stream.on('end', finalize);
        stream.on('error', (err: any) => reject(err));
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 获取音频格式信息（用于预估下载时间）
   */
  static async getAudioFormatInfo(videoId: string): Promise<{
    selectedFormat: OptimizedAudioFormat;
    estimatedDownloadTime: number; // seconds
    supportsParallelDownload: boolean;
  }> {
    try {
      const selectedFormat = await this.selectOptimizedAudioFormat(videoId, { preferSmallSize: true });
      
      // 估算下载时间（基于平均网速10Mbps）
      const averageSpeedBps = 10 * 1024 * 1024 / 8; // 10Mbps in bytes per second
      const estimatedDownloadTime = selectedFormat.contentLength 
        ? Math.ceil(selectedFormat.contentLength / averageSpeedBps)
        : Math.ceil(selectedFormat.approxDurationMs / 1000 * selectedFormat.bitrate * 1024 / 8 / averageSpeedBps);
      
      return {
        selectedFormat,
        estimatedDownloadTime,
        supportsParallelDownload: selectedFormat.supportsRangeRequests || false
      };
    } catch (error) {
      throw new Error(`Failed to get audio format info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检查视频是否适合快速下载
   */
  static async isVideoOptimizedForFastDownload(videoId: string): Promise<{
    isOptimized: boolean;
    reasons: string[];
    recommendations: string[];
  }> {
    try {
      const info = await ytdl.getInfo(videoId);
      const formats = await this.getOptimizedAudioFormats(videoId);
      
      const reasons: string[] = [];
      const recommendations: string[] = [];
      let isOptimized = true;

      // 检查是否是直播
      if (info.videoDetails.isLiveContent) {
        isOptimized = false;
        reasons.push('Live content cannot be optimized for parallel download');
        recommendations.push('Use standard streaming download for live content');
      }

      // 检查是否有支持范围请求的格式
      const rangeFormats = formats.filter(f => f.supportsRangeRequests);
      if (rangeFormats.length === 0) {
        isOptimized = false;
        reasons.push('No formats support range requests (parallel download)');
        recommendations.push('Use ytdl-core streaming as fallback');
      }

      // 检查视频长度
      const duration = parseInt(info.videoDetails.lengthSeconds);
      if (duration > 3600) { // 1 hour
        reasons.push('Long video may benefit from parallel download');
        recommendations.push('Use larger chunk sizes and more concurrent connections');
      }

      // 检查音频质量
      const bestFormat = formats[0];
      if (bestFormat && bestFormat.bitrate < 64) {
        reasons.push('Low bitrate format may have quality issues for transcription');
        recommendations.push('Consider using a higher bitrate format');
      }

      return {
        isOptimized,
        reasons,
        recommendations
      };
    } catch (error) {
      return {
        isOptimized: false,
        reasons: [`Error checking optimization: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Use fallback download method']
      };
    }
  }

  /**
   * 选择最佳字幕
   */
  static selectBestCaption(captions: Caption[], preferredLanguages: string[] = ['en', 'en-US']): Caption | null {
    if (captions.length === 0) return null;

    // 优先选择非自动生成的字幕
    const manualCaptions = captions.filter(c => !c.isAutomatic);
    const autoCaptions = captions.filter(c => c.isAutomatic);

    const allCaptions = [...manualCaptions, ...autoCaptions];

    // 按语言偏好选择
    for (const lang of preferredLanguages) {
      const caption = allCaptions.find(c => c.languageCode.startsWith(lang));
      if (caption) return caption;
    }

    // 返回第一个可用的字幕
    return allCaptions[0];
  }

  /**
   * 解析 XML 字幕为纯文本
   */
  private static parseXMLCaptions(xmlContent: string): string {
    // 兼容 srv1/srv3：允许内嵌标签，统一抽取纯文本
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    const chunks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xmlContent)) !== null) {
      const inner = match[1]
        .replace(/<br\s*\/>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      const decoded = inner
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#10;|&#x0A;/g, '\n');
      const normalized = decoded
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (normalized) chunks.push(normalized);
    }
    return chunks.join(' ');
  }

  /**
   * 将字幕转换为 SRT 格式
   */
  static async convertCaptionToSRT(captionUrl: string): Promise<string> {
    try {
      const xmlContent = await this.fetchCaptionXML(captionUrl);
      return this.parseXMLToSRT(xmlContent);
    } catch (error) {
      console.error('Error converting caption to SRT:', error);
      throw new Error('Failed to convert caption to SRT');
    }
  }

  /**
   * 带重试和兜底策略的字幕 XML 获取
   * 顺序：baseUrl+fmt=srv3 -> baseUrl+fmt=srv1 -> timedtext?lang=..&v=..&fmt=srv3(或srv1)
   */
  private static async fetchCaptionXML(captionUrl: string): Promise<string> {
    const tryFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return '';
      const text = await res.text();
      return text || '';
    };

    // 1) baseUrl + fmt=srv3
    const hasFmt = /[?&]fmt=/.test(captionUrl);
    const urlSrv3 = hasFmt ? captionUrl : `${captionUrl}${captionUrl.includes('?') ? '&' : '?'}fmt=srv3`;
    let xml = await tryFetch(urlSrv3);
    if (xml && xml.length > 0) return xml;

    // 2) baseUrl + fmt=srv1
    const urlSrv1 = hasFmt ? captionUrl : `${captionUrl}${captionUrl.includes('?') ? '&' : '?'}fmt=srv1`;
    xml = await tryFetch(urlSrv1);
    if (xml && xml.length > 0) return xml;

    // 3) Rebuild via timedtext endpoint
    try {
      const u = new URL(captionUrl);
      const lang = u.searchParams.get('lang') || u.searchParams.get('lang_code') || 'en';
      const v = u.searchParams.get('v') || '';
      const kind = u.searchParams.get('kind') || '';
      const timed = new URL('https://www.youtube.com/api/timedtext');
      timed.searchParams.set('lang', lang);
      if (v) timed.searchParams.set('v', v);
      if (kind) timed.searchParams.set('kind', kind);
      timed.searchParams.set('fmt', 'srv3');
      xml = await tryFetch(timed.toString());
      if (xml && xml.length > 0) return xml;

      timed.searchParams.set('fmt', 'srv1');
      xml = await tryFetch(timed.toString());
      if (xml && xml.length > 0) return xml;
    } catch {}

    return '';
  }

  /**
   * 解析 XML 字幕为 SRT 格式
   */
  private static parseXMLToSRT(xmlContent: string): string {
    const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
    const srtEntries = [];
    let match;
    let index = 1;

    while ((match = textRegex.exec(xmlContent)) !== null) {
      const startTime = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      const endTime = startTime + duration;
      
      const inner = match[3]
        .replace(/<br\s*\/>/gi, '\n')
        .replace(/<[^>]+>/g, '');
      const text = inner
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#10;|&#x0A;/g, '\n')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const startSRT = this.secondsToSRTTime(startTime);
      const endSRT = this.secondsToSRTTime(endTime);

      srtEntries.push(`${index}\n${startSRT} --> ${endSRT}\n${text}\n`);
      index++;
    }

    return srtEntries.join('\n');
  }

  /**
   * 将秒数转换为 SRT 时间格式
   */
  private static secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }
}
