type YtdlVideoFormat = any;
type YtdlVideoInfo = any;

const DEFAULT_PROXY_DOWNLOAD_URL = process.env.YOUTUBE_PROXY_DOWNLOAD_URL || 'http://45.32.217.29:8000/download_r2';
const PROXY_CONCURRENCY = Math.max(1, Number(process.env.YOUTUBE_PROXY_CONCURRENCY || 3));
const PROXY_REQUEST_TIMEOUT_MS = Math.max(5000, Number(process.env.YOUTUBE_PROXY_TIMEOUT_MS || 60000));
const INFO_CACHE_TTL_MS = Math.max(30_000, Number(process.env.YOUTUBE_INFO_CACHE_TTL_MS || 5 * 60 * 1000));

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

interface ProxyDownloadResponse {
  success: boolean;
  key?: string;
  uploadedUrl?: string;
  bytes?: number;
  title?: string;
  duration_seconds?: number;
  ext?: string;
  mime?: string;
  id?: string;
  message?: string;
}

type AudioAsset = {
  videoId: string;
  url: string;
  key: string;
  bytes?: number;
  title?: string | null;
  durationSeconds?: number | null;
  ext?: string | null;
  mimeType?: string | null;
  fetchedAt: number;
};

type CachedVideoInfo = {
  info: YtdlVideoInfo;
  fetchedAt: number;
};

class Semaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];

  constructor(count: number) {
    this.available = Math.max(1, count);
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
        return;
      }
    }
    this.available += 1;
  }
}

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
  private static infoCache = new Map<string, CachedVideoInfo>();
  private static audioAssetCache = new Map<string, AudioAsset>();
  private static ytdlClientPromise: Promise<any> | null = null;

  private static async getYtdlClient(): Promise<any> {
    if (!this.ytdlClientPromise) {
      this.ytdlClientPromise = (async () => {
        const mod = await import('@ybd-project/ytdl-core');
        const ctor = (mod as any)?.default ?? (mod as any)?.YtdlCore ?? mod;

        if (typeof ctor === 'function') {
          const instance = new ctor();
          if (typeof instance.getFullInfo === 'function' || typeof instance.getInfo === 'function') {
            return instance;
          }
        } else if (typeof (ctor as any)?.getFullInfo === 'function' || typeof (ctor as any)?.getInfo === 'function') {
          return ctor;
        }

        throw new Error('Unsupported ytdl-core interface');
      })();
    }

    return this.ytdlClientPromise;
  }

  private static getProxySemaphore(): Semaphore {
    const globalAny = globalThis as unknown as { __youtubeProxySemaphore?: Semaphore };
    if (!globalAny.__youtubeProxySemaphore) {
      globalAny.__youtubeProxySemaphore = new Semaphore(PROXY_CONCURRENCY);
    }
    return globalAny.__youtubeProxySemaphore;
  }

  private static getProxyEndpoint(): string {
    return DEFAULT_PROXY_DOWNLOAD_URL;
  }

  private static buildWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  private static buildDefaultThumbnails(videoId: string): string[] {
    return [
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ];
  }

  private static isCacheFresh(ts: number, ttl: number): boolean {
    return Date.now() - ts < ttl;
  }

  private static async fetchYtdlInfo(videoId: string, forceRefresh = false, attempt = 0): Promise<YtdlVideoInfo> {
    const cached = this.infoCache.get(videoId);
    if (!forceRefresh && cached && this.isCacheFresh(cached.fetchedAt, INFO_CACHE_TTL_MS)) {
      return cached.info;
    }

    try {
      const ytdl = await this.getYtdlClient();
      const info: YtdlVideoInfo = typeof ytdl.getFullInfo === 'function'
        ? await ytdl.getFullInfo(videoId)
        : await ytdl.getInfo(videoId);
      this.infoCache.set(videoId, { info, fetchedAt: Date.now() });
      return info;
    } catch (error: any) {
      this.ytdlClientPromise = null;
      if (attempt < 2) {
        const delay = Math.min(1500 * Math.pow(1.5, attempt), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchYtdlInfo(videoId, forceRefresh, attempt + 1);
      }
      console.error('[YouTube] Failed to fetch metadata via ytdl', {
        videoId,
        error: error?.message,
      });
      throw new Error(error?.message || 'Unable to retrieve YouTube metadata');
    }
  }

  private static extractCaptions(info: YtdlVideoInfo): Caption[] {
    const tracks =
      info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    return tracks.map((track: any) => ({
      languageCode: track.languageCode || track.vssId || 'unknown',
      name: track.name?.simpleText || track.languageName?.simpleText || track.languageCode || 'Unknown',
      url: track.baseUrl || track?.url || '',
      isAutomatic: track.kind === 'asr',
    })).filter((caption: any) => Boolean(caption.url));
  }

  private static transformYtdlFormat(format: YtdlVideoFormat, durationSeconds: number): OptimizedAudioFormat {
    const bitrateBps = format.bitrate || format.averageBitrate || 0;
    const bitrateKbps = bitrateBps ? Math.max(64, Math.round(bitrateBps / 1000)) : 128;
    const contentLength = format.contentLength ? Number(format.contentLength) : undefined;
    const approxDurationMs = durationSeconds > 0
      ? durationSeconds * 1000
      : (format.approxDurationMs ? Number(format.approxDurationMs) : 0);

    return {
      itag: format.itag,
      url: format.url,
      mimeType: format.mimeType || 'audio/webm',
      bitrate: bitrateKbps,
      contentLength,
      quality: format.audioQuality || format.qualityLabel || 'audio',
      audioQuality: format.audioQuality || 'unknown',
      approxDurationMs,
      supportsRangeRequests: !format.isHLS,
      isDrc: false,
      isDefaultAudio: false,
      audioTrackId: (format as any)?.audioTrack?.id,
      audioTrackDisplayName: (format as any)?.audioTrack?.displayName,
    };
  }

  private static async getAudioAsset(
    videoId: string,
    options: {
      youtubeUrl?: string;
      forceRefresh?: boolean;
      debugLabel?: string;
    } = {}
  ): Promise<AudioAsset> {
    const allowCache = !options.forceRefresh;
    const cached = this.audioAssetCache.get(videoId);
    if (allowCache && cached) {
      return cached;
    }

    const semaphore = this.getProxySemaphore();
    await semaphore.acquire();

    try {
      const youtubeUrl = options.youtubeUrl || this.buildWatchUrl(videoId);
      const endpoint = `${this.getProxyEndpoint()}?url=${encodeURIComponent(youtubeUrl)}`;

      console.log('[YouTube] Proxy download request start', {
        videoId,
        endpoint,
        debugLabel: options.debugLabel,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROXY_REQUEST_TIMEOUT_MS);

      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawBody = await response.text();

      console.log('[YouTube] Proxy download response', {
        rawBody,
       });

      if (!response.ok) {
        console.error('[YouTube] Proxy download failed', {
          videoId,
          status: response.status,
          statusText: response.statusText,
          body: rawBody.slice(0, 500),
        });
        throw new Error(`Proxy download failed with status ${response.status}`);
      }

      let parsed: ProxyDownloadResponse;
      try {
        parsed = JSON.parse(rawBody) as ProxyDownloadResponse;
      } catch (error) {
        console.error('[YouTube] Proxy response JSON parse error', {
          videoId,
          rawSnippet: rawBody.slice(0, 500),
        });
        throw new Error('Proxy service returned invalid JSON');
      }

      if (!parsed.success || !parsed.uploadedUrl) {
        throw new Error(parsed.message || 'Proxy service did not return uploadedUrl');
      }

      const asset: AudioAsset = {
        videoId,
        url: parsed.uploadedUrl,
        key: parsed.key || cached?.key || '',
        bytes: typeof parsed.bytes === 'number' ? parsed.bytes : cached?.bytes,
        title: typeof parsed.title === 'string'
          ? parsed.title
          : (cached?.title ?? null),
        durationSeconds: typeof parsed.duration_seconds === 'number'
          ? parsed.duration_seconds
          : (cached?.durationSeconds ?? null),
        ext: typeof parsed.ext === 'string'
          ? parsed.ext
          : (cached?.ext ?? null),
        mimeType: typeof parsed.mime === 'string'
          ? parsed.mime
          : (cached?.mimeType ?? null),
        fetchedAt: Date.now(),
      };

      this.audioAssetCache.set(videoId, asset);
      return asset;
    } finally {
      semaphore.release();
    }
  }

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
      const info = await this.fetchYtdlInfo(videoId);
      const captionsRenderer = info.player_response?.captions?.playerCaptionsTracklistRenderer;
      if (!captionsRenderer?.captionTracks?.length) {
        return [{
          languageCode: 'default',
          trackType: 'original',
          displayName: 'Default (Original)',
          formats: info.formats.filter((format: any) => format.hasAudio && !format.hasVideo).length,
        }];
      }

      return captionsRenderer.captionTracks.map((track: any) => ({
        languageCode: track.languageCode || track.vssId || 'unknown',
        trackType: track.kind === 'asr' ? 'dubbed-auto' : 'original',
        displayName: track.name?.simpleText || track.languageName?.simpleText || track.languageCode || 'Unknown',
        formats: info.formats.filter((format: any) => format.hasAudio && !format.hasVideo).length,
      }));
    } catch (error) {
      console.error('Error detecting audio tracks:', error);
      return [];
    }
  }

  /**
   * 获取视频信息和字幕
   */
  static async getVideoInfo(videoId: string, forceRefresh = false): Promise<VideoInfo> {
    let proxyAsset = this.audioAssetCache.get(videoId);

    if (!proxyAsset || forceRefresh) {
      try {
        proxyAsset = await this.getAudioAsset(videoId, {
          forceRefresh,
          debugLabel: 'video-info',
        });
      } catch (error) {
        console.warn('[YouTube] Proxy metadata unavailable, falling back to ytdl', {
          videoId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (proxyAsset && (proxyAsset.title || typeof proxyAsset.durationSeconds === 'number')) {
      return {
        videoId,
        title: proxyAsset.title || '',
        duration: proxyAsset.durationSeconds ?? 0,
        thumbnails: this.buildDefaultThumbnails(videoId),
        captions: [],
      };
    }

    try {
      const info = await this.fetchYtdlInfo(videoId, forceRefresh);
      const details = info.videoDetails;

      const title = details.title || '';
      const duration = Number.parseInt(details.lengthSeconds || '0', 10) || 0;
      const thumbnails = details.thumbnails?.length
        ? details.thumbnails.map((item: any) => item.url).reverse()
        : this.buildDefaultThumbnails(videoId);

      const captions = this.extractCaptions(info);

      return {
        videoId,
        title,
        duration,
        thumbnails,
        captions,
      };
    } catch (error) {
      const fallback = await this.fetchOEmbedVideoInfo(videoId);
      if (fallback) {
        return fallback;
      }
      throw error;
    }
  }

  private static async fetchOEmbedVideoInfo(videoId: string): Promise<VideoInfo | null> {
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(this.buildWatchUrl(videoId))}`;
      const response = await fetch(oEmbedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json() as { title?: string; author_name?: string; thumbnail_url?: string };
      const title = payload.title || payload.author_name || '';
      const thumbnail = payload.thumbnail_url ? [payload.thumbnail_url] : this.buildDefaultThumbnails(videoId);

      return {
        videoId,
        title,
        duration: 0,
        thumbnails: thumbnail,
        captions: [],
      };
    } catch {
      return null;
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
  static async getAudioStreamUrl(videoId: string, _preferredLanguage?: string, retryCount = 0): Promise<string> {
    try {
      const asset = await this.getAudioAsset(videoId, {
        forceRefresh: retryCount > 0,
        debugLabel: retryCount > 0 ? `retry-${retryCount}` : undefined,
      });
      return asset.url;
    } catch (error: any) {
      console.error(`[YouTube] Failed to resolve proxy audio (attempt ${retryCount + 1})`, {
        videoId,
        error: error?.message,
      });

      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 700 * (retryCount + 1)));
        return this.getAudioStreamUrl(videoId, _preferredLanguage, retryCount + 1);
      }

      throw new Error(error?.message || 'Failed to obtain audio asset');
    }
  }

  /**
   * 获取优化的音频格式列表（用于快速下载）
   */
  static async getOptimizedAudioFormats(videoId: string, preferredLanguage?: string): Promise<OptimizedAudioFormat[]> {
    const info = await this.fetchYtdlInfo(videoId);
    const durationSeconds = Number.parseInt(info.videoDetails.lengthSeconds || '0', 10) || 0;

    const audioFormats = info.formats
      .filter((format: any) => format.hasAudio && !format.hasVideo)
      .map((format: any) => this.transformYtdlFormat(format, durationSeconds))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

    if (!audioFormats.length) {
      throw new Error('No audio-only formats available for this video');
    }

    if (audioFormats.length) {
      audioFormats[0].isDefaultAudio = true;
    }

    const normalizedLanguage = preferredLanguage?.toLowerCase();
    if (normalizedLanguage) {
      const languageMatch = audioFormats.filter((format: any) =>
        format.audioTrackId?.toLowerCase().includes(normalizedLanguage) ||
        format.audioTrackDisplayName?.toLowerCase().includes(normalizedLanguage)
      );
      if (languageMatch.length) {
        return languageMatch;
      }
    }

    return audioFormats;
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
      onProgress,
      onError,
    } = options;

    const asset = await this.getAudioAsset(videoId, { debugLabel: options.debugLabel });
    const totalSize = asset.bytes;

    if (enableParallelDownload && totalSize && totalSize > chunkSize) {
      return this.downloadWithParallelChunks(asset.url, totalSize, {
        chunkSize,
        maxConcurrentChunks,
        timeout,
        retryAttempts,
        retryDelay,
        onProgress,
        onError,
        debugLabel: options.debugLabel,
      });
    }

    return this.downloadWithStream(asset.url, {
      timeout,
      retryAttempts,
      retryDelay,
      onProgress,
      onError,
      totalSize,
      debugLabel: options.debugLabel,
    });
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
      const info = await this.fetchYtdlInfo(videoId);
      const formats = await this.getOptimizedAudioFormats(videoId);

      const reasons: string[] = [];
      const recommendations: string[] = [];
      let isOptimized = true;

      const duration = Number.parseInt(info.videoDetails.lengthSeconds || '0', 10) || 0;
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

}
