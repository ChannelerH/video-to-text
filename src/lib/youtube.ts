
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
  debugLabel?: string; // optional hint to tag logs
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
  isDefaultAudio?: boolean;
  audioTrackId?: string;
  audioTrackDisplayName?: string;
}

export interface AudioTrackInfo {
  languageCode: string;
  trackType: 'original' | 'dubbed-auto';
  displayName: string;
  formats: number; // 可用格式数量
}

interface Mp36VideoData {
  status?: string;
  msg?: string;
  link?: string;
  title?: string;
  filesize?: number | string;
  duration?: number | string;
  progress?: number | string;
}

const DEFAULT_RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';

type PrefetchedDownload = {
  videoId: string;
  link?: string;
  title?: string;
  filesize?: number | string;
  duration?: number | string;
};

function parseDurationFromString(value: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[parts.length - 1 - i];
      seconds += part * Math.pow(60, i);
    }
    return seconds;
  }

  if (/^PT/.test(trimmed)) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/;
    const match = regex.exec(trimmed);
    if (!match) return null;
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseFloat(match[3]) : 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function parseSizeString(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = /(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)/i.exec(value);
  if (!match) return undefined;
  const amount = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };
  const multiplier = multipliers[unit];
  return Number.isFinite(multiplier) ? Math.round(amount * multiplier) : undefined;
}

export class YouTubeService {
  private static rapidApiCache = new Map<string, Mp36VideoData>();
  private static prefetchedCache = new Map<string, Mp36VideoData>();

  /**
   * 验证并解析 YouTube URL
   */
  static validateAndParseUrl(input: string): string | null {
    return this.extractVideoId(input);
  }

  /**
   * 检测视频的可用音轨语言
   */
  static async detectAudioTracks(videoId: string): Promise<AudioTrackInfo[]> {
    try {
      const formats = await this.getOptimizedAudioFormats(videoId);
      if (!formats.length) return [];
      return [{
        languageCode: 'default',
        trackType: 'original',
        displayName: 'Default (Original)',
        formats: formats.length,
      }];
    } catch (error) {
      console.error('Error detecting audio tracks:', error);
      return [];
    }
  }

  /**
   * 获取视频信息和字幕
   */
  static async getVideoInfo(videoId: string, retryCount = 0): Promise<VideoInfo> {
    const maxRetries = process.env.YOUTUBE_SPEED_MODE === 'true' ? 1 : 2;
    const baseDelay = 500;

    try {
      const data = await this.fetchVideoData(videoId, retryCount > 0);
      return this.parseVideoInfo(data, videoId);
    } catch (error: any) {
      console.error(`Error getting video info (attempt ${retryCount + 1}):`, {
        error: error?.message,
      });

      const isNetworkError =
        error?.name === 'AbortError' ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ETIMEDOUT' ||
        error?.message?.includes('socket hang up') ||
        error?.message?.includes('read ECONNRESET');

      if (isNetworkError && retryCount < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(1.5, retryCount), 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getVideoInfo(videoId, retryCount + 1);
      }

      throw new Error(`Failed to get video info after ${retryCount + 1} attempts: ${error?.message ?? error}`);
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
   */
  static async getAudioStreamUrl(videoId: string, preferredLanguage?: string, retryCount = 0): Promise<string> {
    try {
      const formats = await this.getOptimizedAudioFormats(videoId, preferredLanguage);
      if (!formats.length) {
        throw new Error('No audio formats available');
      }
      return formats[0].url;
    } catch (error: any) {
      console.error(`Error getting audio stream (attempt ${retryCount + 1}):`, {
        error: error?.message,
      });

      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return this.getAudioStreamUrl(videoId, preferredLanguage, retryCount + 1);
      }

      throw new Error(`Failed to get audio stream after ${retryCount + 1} attempts: ${error?.message ?? error}`);
    }
  }

  /**
   * 获取优化的音频格式列表（用于快速下载）
   */
  static async getOptimizedAudioFormats(videoId: string, preferredLanguage?: string): Promise<OptimizedAudioFormat[]> {
    const data = await this.fetchVideoData(videoId);
    if (!data.link) {
      throw new Error('RapidAPI returned empty download link');
    }

    const durationSeconds = this.parseDurationSeconds(data) ?? 0;
    const fileSize = this.parseFileSize(data.filesize);

    const format: OptimizedAudioFormat = {
      itag: 0,
      url: data.link,
      mimeType: 'audio/mpeg',
      bitrate: this.estimateBitrateKbps(durationSeconds, fileSize),
      contentLength: fileSize,
      quality: 'mp3',
      audioQuality: 'mp3',
      approxDurationMs: Math.max(0, durationSeconds) * 1000,
      supportsRangeRequests: true,
      isDrc: false,
      isDefaultAudio: true,
      audioTrackDisplayName: 'Default (mp3)',
      audioTrackId: undefined,
    };

    return [format];
  }

  static async selectOptimizedAudioFormat(videoId: string, options?: { preferSmallSize?: boolean }): Promise<OptimizedAudioFormat> {
    const formats = await this.getOptimizedAudioFormats(videoId);

    if (!formats.length) {
      throw new Error('No suitable audio formats found');
    }

    const defaultFormats = formats.filter(f => f.isDefaultAudio);
    const defaultPool = defaultFormats.length ? defaultFormats : formats;

    const nonDrc = defaultPool.filter(f => !f.isDrc);
    const candidates = nonDrc.length ? nonDrc : defaultPool;

    if (options?.preferSmallSize) {
      return candidates[0];
    }

    const balanced = candidates.find(f => f.bitrate >= 96 && f.bitrate <= 160 && (f.supportsRangeRequests ?? true))
      || candidates.find(f => f.bitrate >= 96 && (f.supportsRangeRequests ?? true))
      || candidates[0];

    return balanced;
  }

  private static parseFileSize(input: number | string | undefined): number | undefined {
    if (input === undefined || input === null) {
      return undefined;
    }
    if (typeof input === 'number') {
      return Number.isFinite(input) && input > 0 ? Math.round(input) : undefined;
    }
    if (/^\d+$/.test(input)) {
      const parsed = parseInt(input, 10);
      return parsed > 0 ? parsed : undefined;
    }
    const parsed = parseSizeString(input);
    return parsed && parsed > 0 ? parsed : undefined;
  }

  private static estimateBitrateKbps(durationSeconds: number, fileSizeBytes?: number | undefined): number {
    if (!fileSizeBytes || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || !durationSeconds || durationSeconds <= 0) {
      return 128; // sensible default for mp3
    }
    const bytesPerSecond = fileSizeBytes / durationSeconds;
    const kbps = (bytesPerSecond * 8) / 1024;
    return Math.max(64, Math.round(kbps));
  }

  private static normalizePrefetchedData(videoId: string, data: PrefetchedDownload | Mp36VideoData | undefined | null): Mp36VideoData | null {
    if (!data) return null;
    if ('link' in data || 'title' in data || 'filesize' in data || 'duration' in data) {
      const { link, title, filesize, duration } = data as PrefetchedDownload;
      return {
        status: 'ok',
        msg: 'prefetched',
        link,
        title,
        filesize,
        duration,
      };
    }
    return data as Mp36VideoData;
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
      chunkSize = 1024 * 1024,
      maxConcurrentChunks = 4,
      timeout = 60000,
      retryAttempts = 1,
      retryDelay = 1000,
      cdnProxy,
      onProgress,
      onError
    } = options;

    let refreshAttempted = false;

    while (true) {
      try {
        const audioFormat = await this.selectOptimizedAudioFormat(videoId, { preferSmallSize: false });
        const originalUrl = audioFormat.url;
        const attempts: Array<{ url: string; viaProxy: boolean }> = [];
        const baseLabel = options.debugLabel || null;

        let proxiedUrl = originalUrl;
        if (cdnProxy) {
          proxiedUrl = this.applyCdnProxy(originalUrl, cdnProxy);
          if (proxiedUrl !== originalUrl) {
            attempts.push({ url: proxiedUrl, viaProxy: true });
          }
        }

        attempts.push({ url: originalUrl, viaProxy: false });

        const logTarget = (target: string, viaProxy: boolean) => {
          try {
            const parsed = new URL(target);
            console.log('[YouTube] Download target selected', {
              host: parsed.host,
              pathname: parsed.pathname,
              viaProxy,
            });
          } catch (err) {
            console.warn('[YouTube] Failed to parse download target for logging', err);
          }
        };

        const performDownload = async (targetUrl: string, viaProxy: boolean) => {
          const debugLabel = baseLabel
            ? `${baseLabel}:${viaProxy ? 'proxy' : 'direct'}`
            : viaProxy ? 'proxy' : 'direct';

          if (enableParallelDownload && (audioFormat.supportsRangeRequests ?? true) && audioFormat.contentLength) {
            return await this.downloadWithParallelChunks(targetUrl, audioFormat.contentLength, {
              chunkSize,
              maxConcurrentChunks,
              timeout,
              retryAttempts,
              retryDelay,
              onProgress,
              onError,
              debugLabel,
            });
          }

          return await this.downloadWithStream(targetUrl, {
            timeout,
            retryAttempts,
            retryDelay,
            onProgress,
            onError,
            totalSize: audioFormat.contentLength,
            debugLabel,
          });
        };

        let lastError: unknown;
        for (const attempt of attempts) {
          logTarget(attempt.url, attempt.viaProxy);
          try {
            return await performDownload(attempt.url, attempt.viaProxy);
          } catch (err) {
            lastError = err;
            const message = err instanceof Error ? err.message : String(err);
            console.warn('[YouTube] Download attempt failed', {
              viaProxy: attempt.viaProxy,
              message,
              host: (() => { try { return new URL(attempt.url).host; } catch { return null; } })(),
            });

            const isNotFound = typeof message === 'string' && /HTTP\s+404/.test(message);
            if (!attempt.viaProxy || !isNotFound) {
              console.warn('[YouTube] Download failed without proxy fallback', {
                viaProxy: attempt.viaProxy,
              });
              break;
            }

            console.warn('[YouTube] Proxy responded with 404, retrying with original URL');
          }
        }

        throw lastError ?? new Error('YouTube download failed without explicit error');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isNotFound = typeof message === 'string' && /HTTP\s+404/.test(message);

        if (isNotFound && !refreshAttempted) {
          console.warn('[YouTube] Download failed with 404, refreshing RapidAPI data and retrying');
          refreshAttempted = true;
          try {
            await this.fetchVideoData(videoId, true);
          } catch (refreshError) {
            console.error('[YouTube] RapidAPI refresh failed', refreshError);
            throw error;
          }
          continue;
        }

        if (onError) {
          onError(error as Error);
        }
        throw error;
      }
    }
  }

  /**
   * 使用 HTTP 流作为保底方案，保留原签名
   */
  static async downloadAudioWithYtdlStream(videoId: string, options: DownloadOptions = {}): Promise<Buffer> {
    return this.downloadAudioStreamOptimized(videoId, {
      ...options,
      enableParallelDownload: false,
    });
  }

  /**
   * 仅下载前 N 秒音频片段用于语言探针（尽量小且快速）
   */
  static async downloadAudioClip(videoId: string, seconds: number = 10): Promise<Buffer> {
    const clipSeconds = Math.max(5, Math.min(20, Math.floor(seconds)));
    const format = await this.selectOptimizedAudioFormat(videoId, { preferSmallSize: true });
    const bitrateKbps = format.bitrate || 96;
    const bytesPerSecond = (bitrateKbps * 1024) / 8;
    const targetBytes = Math.max(32_000, Math.floor(bytesPerSecond * clipSeconds * 1.2));

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
    };
    if (format.supportsRangeRequests ?? true) {
      headers['Range'] = `bytes=0-${targetBytes - 1}`;
    }

    const response = await fetch(format.url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download audio clip: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.length > targetBytes ? buffer.subarray(0, targetBytes) : buffer;
  }

  /**
   * 获取音频格式信息（用于预估下载时间）
   */
  static async getAudioFormatInfo(videoId: string): Promise<{
    selectedFormat: OptimizedAudioFormat;
    estimatedDownloadTime: number; // seconds
    supportsParallelDownload: boolean;
  }> {
    const selectedFormat = await this.selectOptimizedAudioFormat(videoId, { preferSmallSize: true });
    const averageSpeedBps = (10 * 1024 * 1024) / 8;
    const estimatedDownloadTime = selectedFormat.contentLength
      ? Math.ceil(selectedFormat.contentLength / averageSpeedBps)
      : Math.ceil((selectedFormat.approxDurationMs / 1000) * (selectedFormat.bitrate * 1024 / 8) / averageSpeedBps);

    return {
      selectedFormat,
      estimatedDownloadTime,
      supportsParallelDownload: selectedFormat.supportsRangeRequests ?? true,
    };
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
      const data = await this.fetchVideoData(videoId);
      const formats = await this.getOptimizedAudioFormats(videoId);

      const reasons: string[] = [];
      const recommendations: string[] = [];
      let isOptimized = true;

      const duration = this.parseDurationSeconds(data) ?? 0;
      if (duration > 3600) {
        reasons.push('Long video may benefit from parallel download');
        recommendations.push('Use larger chunk sizes and more concurrent connections');
      }

      const rangeFormats = formats.filter(f => f.supportsRangeRequests ?? true);
      if (!rangeFormats.length) {
        isOptimized = false;
        reasons.push('No formats support range requests (parallel download)');
        recommendations.push('Use sequential streaming download');
      }

      const bestFormat = formats[0];
      if (bestFormat && bestFormat.bitrate < 64) {
        reasons.push('Low bitrate format may have quality issues for transcription');
        recommendations.push('Consider using a higher bitrate format');
      }

      return {
        isOptimized,
        reasons,
        recommendations,
      };
    } catch (error) {
      return {
        isOptimized: false,
        reasons: [`Error checking optimization: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Use fallback download method'],
      };
    }
  }

  static selectBestCaption(captions: Caption[], preferredLanguages: string[] = ['en', 'en-US']): Caption | null {
    if (captions.length === 0) return null;

    const manualCaptions = captions.filter(c => !c.isAutomatic);
    const autoCaptions = captions.filter(c => c.isAutomatic);
    const allCaptions = [...manualCaptions, ...autoCaptions];

    for (const lang of preferredLanguages) {
      const caption = allCaptions.find(c => c.languageCode.startsWith(lang));
      if (caption) return caption;
    }

    return allCaptions[0];
  }

  private static parseXMLCaptions(xmlContent: string): string {
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

  static async convertCaptionToSRT(captionUrl: string): Promise<string> {
    try {
      const xmlContent = await this.fetchCaptionXML(captionUrl);
      return this.parseXMLToSRT(xmlContent);
    } catch (error) {
      console.error('Error converting caption to SRT:', error);
      throw new Error('Failed to convert caption to SRT');
    }
  }

  private static async fetchCaptionXML(captionUrl: string): Promise<string> {
    const tryFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return '';
      const text = await res.text();
      return text || '';
    };

    const hasFmt = /[?&]fmt=/.test(captionUrl);
    const urlSrv3 = hasFmt ? captionUrl : `${captionUrl}${captionUrl.includes('?') ? '&' : '?'}fmt=srv3`;
    let xml = await tryFetch(urlSrv3);
    if (xml && xml.length > 0) return xml;

    const urlSrv1 = hasFmt ? captionUrl : `${captionUrl}${captionUrl.includes('?') ? '&' : '?'}fmt=srv1`;
    xml = await tryFetch(urlSrv1);
    if (xml && xml.length > 0) return xml;

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

  private static parseXMLToSRT(xmlContent: string): string {
    const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
    const srtEntries: string[] = [];
    let match: RegExpExecArray | null;
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

  private static secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private static async fetchVideoData(videoId: string, forceRefresh = false, attempt = 0): Promise<Mp36VideoData> {
    if (!forceRefresh) {
      const cached = this.rapidApiCache.get(videoId) || this.prefetchedCache.get(videoId);
      if (cached) {
        return cached;
      }
    }

    const { host, key } = this.getRapidApiCredentials();
    const endpoint = `https://${host}/dl?id=${encodeURIComponent(videoId)}`;

    console.log('[YouTube] RapidAPI request start', {
      videoId,
      host,
      attempt,
      forceRefresh,
    });

    const response = await fetch(endpoint, {
      headers: {
        'x-rapidapi-host': host,
        'x-rapidapi-key': key,
        'Accept': 'application/json',
      },
    });

    const rawBody = await response.text();

    console.log('[YouTube] RapidAPI response meta', {
      status: response.status,
      statusText: response.statusText,
      length: rawBody.length,
      attempt,
    });

    if (!response.ok) {
      console.error('[YouTube] RapidAPI request failed', {
        status: response.status,
        statusText: response.statusText,
        body: rawBody,
      });
      throw new Error(`RapidAPI request failed with status ${response.status}`);
    }

    let data: Mp36VideoData;
    try {
      data = JSON.parse(rawBody) as Mp36VideoData;
    } catch (parseError) {
      console.error('[YouTube] Failed to parse RapidAPI response as JSON', {
        parseError,
        bodySnippet: rawBody.slice(0, 500),
      });
      throw new Error('RapidAPI response is not valid JSON');
    }

    console.log('[YouTube] RapidAPI parsed data', {
      status: data.status,
      msg: data.msg,
      link: data.link,
      filesize: data.filesize,
      duration: data.duration,
      progress: data.progress,
      attempt,
    });

    if (!data) {
      throw new Error('RapidAPI response is empty');
    }

    const status = data.status?.toLowerCase();
    if (status === 'in process' || status === 'processing') {
      if (attempt >= 4) {
        throw new Error(data.msg ? String(data.msg) : 'RapidAPI still processing download');
      }
      const delay = Math.min(2000 * Math.pow(2, Math.max(0, attempt - 0)), 16000);
      await sleep(delay);
      return this.fetchVideoData(videoId, true, attempt + 1);
    }

    if (!data.link || (status && status !== 'ok' && status !== 'success')) {
      throw new Error(data.msg ? String(data.msg) : 'RapidAPI returned invalid download data');
    }

    this.rapidApiCache.set(videoId, data);
    return data;
  }

  private static parseVideoInfo(data: Mp36VideoData, videoId: string): VideoInfo {
    const title = typeof data.title === 'string' && data.title.length > 0 ? data.title : '';
    const duration = this.parseDurationSeconds(data) || 0;
    const thumbnails = this.collectThumbnails(videoId);

    return {
      videoId,
      title,
      duration,
      thumbnails,
    };
  }

  private static parseDurationSeconds(data: Mp36VideoData): number | null {
    const candidates: Array<string | number | undefined> = [
      data.duration,
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      if (typeof candidate === 'number') {
        if (Number.isFinite(candidate) && candidate > 0) {
          return Math.round(candidate);
        }
        continue;
      }

      const parsed = parseDurationFromString(candidate);
      if (parsed && parsed > 0) {
        return Math.round(parsed);
      }
    }

    return null;
  }

  private static collectThumbnails(videoId: string): string[] {
    return [
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ];
  }

  static primeVideoData(videoId: string, data: PrefetchedDownload | Mp36VideoData) {
    const normalized = this.normalizePrefetchedData(videoId, data);
    if (normalized) {
      this.rapidApiCache.set(videoId, normalized);
      this.prefetchedCache.set(videoId, normalized);
    }
  }

  static getPrimedVideoData(videoId: string): Mp36VideoData | undefined {
    return this.rapidApiCache.get(videoId) || this.prefetchedCache.get(videoId);
  }

  private static applyCdnProxy(url: string, cdnProxy: string): string {
    try {
      const parsedOriginal = new URL(url);
      const originalUrl = parsedOriginal.toString();

      console.log('[YouTube] Applying CDN proxy', {
        proxy: cdnProxy,
        originalHost: parsedOriginal.host,
      });

      if (cdnProxy.includes('{url}')) {
        const proxied = cdnProxy.replace('{url}', encodeURIComponent(originalUrl));
        console.log('[YouTube] Proxy template resolved', {
          viaTemplate: true,
          host: (() => { try { return new URL(proxied).host; } catch { return null; } })(),
        });
        return proxied;
      }
      if (cdnProxy.includes('%s')) {
        const proxied = cdnProxy.replace('%s', encodeURIComponent(originalUrl));
        console.log('[YouTube] Proxy template resolved', {
          viaTemplate: true,
          host: (() => { try { return new URL(proxied).host; } catch { return null; } })(),
        });
        return proxied;
      }

      const proxyUrl = new URL(cdnProxy);
      proxyUrl.searchParams.set('url', originalUrl);
      console.log('[YouTube] Proxy URL constructed', {
        host: proxyUrl.host,
        pathname: proxyUrl.pathname,
      });
      return proxyUrl.toString();
    } catch (error) {
      console.warn('Failed to apply CDN proxy, using original URL:', error);
      return url;
    }
  }

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
      debugLabel?: string;
    }
  ): Promise<Buffer> {
    const { chunkSize, maxConcurrentChunks, timeout, retryAttempts, retryDelay, onProgress, onError, debugLabel } = options;

    const debugHost = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'unknown';
      }
    })();

    console.log('[YouTube] Parallel download start', {
      host: debugHost,
      totalSize,
      chunkSize,
      maxConcurrentChunks,
      debugLabel,
    });

    const chunks: Buffer[] = [];
    const totalChunks = Math.ceil(totalSize / chunkSize);
    let completedChunks = 0;
    let bytesDownloaded = 0;
    const startTime = Date.now();

    const chunkTasks: Promise<{ index: number; buffer: Buffer }>[] = [];

    for (let i = 0; i < totalChunks; i += maxConcurrentChunks) {
      const batch: Promise<{ index: number; buffer: Buffer }>[] = [];

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
          retryDelay,
          debugLabel
        ).then(buffer => {
          completedChunks++;
          bytesDownloaded += buffer.length;

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
              totalChunks,
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

      const batchResults = await Promise.all(batch);
      chunkTasks.push(...batchResults.map(r => Promise.resolve(r)));
    }

    const results = await Promise.all(chunkTasks);
    results.sort((a, b) => a.index - b.index);
    const finalBuffer = Buffer.concat(results.map(r => r.buffer));
    console.log('[YouTube] Parallel download complete', {
      host: debugHost,
      totalBytes: finalBuffer.length,
      debugLabel,
    });
    return finalBuffer;
  }

  private static async downloadChunkWithRetry(
    url: string,
    start: number,
    end: number,
    chunkIndex: number,
    timeout: number,
    retryAttempts: number,
    retryDelay: number,
    debugLabel?: string
  ): Promise<Buffer> {
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        console.log('[YouTube] Chunk request', {
          attempt,
          chunkIndex,
          start,
          end,
          debugLabel,
        });

        const response = await fetch(url, {
          headers: {
            'Range': `bytes=${start}-${end}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn('[YouTube] Chunk response not ok', {
            status: response.status,
            statusText: response.statusText,
            chunkIndex,
            attempt,
            debugLabel,
          });
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (response.status === 206 || response.status === 200) {
          console.log('[YouTube] Chunk response ok', {
            status: response.status,
            chunkIndex,
            attempt,
            bytes: response.headers.get('content-length') || 'unknown',
            debugLabel,
          });
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }

        throw new Error(`Unexpected status code: ${response.status}`);
      } catch (error) {
        console.warn('[YouTube] Chunk download error', {
          attempt,
          chunkIndex,
          message: error instanceof Error ? error.message : String(error),
          debugLabel,
        });
        if (attempt === retryAttempts) {
          throw error;
        }

        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log('[YouTube] Chunk retry scheduled', {
          delay,
          nextAttempt: attempt + 1,
          chunkIndex,
          debugLabel,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to download chunk ${chunkIndex} after ${retryAttempts} attempts`);
  }

  private static async downloadWithStream(
    url: string,
    options: {
      timeout: number;
      retryAttempts: number;
      retryDelay: number;
      onProgress?: (progress: DownloadProgress) => void;
      onError?: (error: Error) => void;
      totalSize?: number;
      debugLabel?: string;
    }
  ): Promise<Buffer> {
    const { timeout, retryAttempts, retryDelay, onProgress, onError, totalSize, debugLabel } = options;

    const debugHost = (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'unknown';
      }
    })();

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        console.log('[YouTube] Stream download attempt', {
          attempt,
          host: debugHost,
          totalSize,
          debugLabel,
        });

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn('[YouTube] Stream response not ok', {
            status: response.status,
            statusText: response.statusText,
            attempt,
            debugLabel,
          });
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('[YouTube] Stream response ok', {
          status: response.status,
          contentLength: response.headers.get('content-length') || 'unknown',
          debugLabel,
        });

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

            if (onProgress) {
              const elapsed = (Date.now() - startTime) / 1000;
              const speed = bytesDownloaded / elapsed;

              onProgress({
                bytesDownloaded,
                totalBytes: contentLength,
                percentage: contentLength ? Math.round((bytesDownloaded / contentLength) * 100) : undefined,
                speed: Math.round(speed),
                eta: contentLength ? Math.round((contentLength - bytesDownloaded) / speed) : undefined,
              });
            }
          }
        } finally {
          reader.releaseLock();
        }

        const buffer = Buffer.concat(chunks);
        console.log('[YouTube] Stream download complete', {
          host: debugHost,
          totalBytes: buffer.length,
          debugLabel,
        });
        return buffer;
      } catch (error) {
        if (attempt === retryAttempts) {
          if (onError) {
            onError(error as Error);
          }
          throw error;
        }

        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log('[YouTube] Stream retry scheduled', {
          delay,
          nextAttempt: attempt + 1,
          host: debugHost,
          debugLabel,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to download after ${retryAttempts} attempts`);
  }

  private static extractVideoId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      if (url.hostname.endsWith('youtu.be')) {
        const id = url.pathname.split('/').filter(Boolean)[0];
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }

      if (url.hostname.includes('youtube.com')) {
        if (url.searchParams.has('v')) {
          const id = url.searchParams.get('v');
          return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
        }

        const pathSegments = url.pathname.split('/').filter(Boolean);
        if (pathSegments.length) {
          const possibleId = pathSegments[pathSegments.length - 1];
          if (/^[a-zA-Z0-9_-]{11}$/.test(possibleId)) {
            return possibleId;
          }
        }
      }
    } catch {
      if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
      }
    }

    return null;
  }

  private static getRapidApiCredentials(): { host: string; key: string } {
    const host = process.env.RAPIDAPI_YTSTREAM_HOST || DEFAULT_RAPIDAPI_HOST;
    const key = process.env.RAPIDAPI_YTSTREAM_KEY || process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_TOKEN;

    if (!key) {
      throw new Error('Missing RapidAPI credentials. Set RAPIDAPI_YTSTREAM_KEY or RAPIDAPI_KEY environment variable.');
    }

    return { host, key };
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
