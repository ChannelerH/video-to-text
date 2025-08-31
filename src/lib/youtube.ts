import ytdl from '@distube/ytdl-core';

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
   * 获取视频信息和字幕
   */
  static async getVideoInfo(videoId: string): Promise<VideoInfo> {
    try {
      const info = await ytdl.getInfo(videoId);
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

      return {
        videoId,
        title: videoDetails.title,
        duration: parseInt(videoDetails.lengthSeconds),
        thumbnails: videoDetails.thumbnails?.map((t: any) => t.url) || [],
        captions: captions.length > 0 ? captions : undefined
      };
    } catch (error) {
      console.error('Error getting video info:', error);
      throw new Error('Failed to get video information');
    }
  }

  /**
   * 下载字幕
   */
  static async downloadCaption(captionUrl: string): Promise<string> {
    try {
      const response = await fetch(captionUrl);
      if (!response.ok) {
        throw new Error(`Failed to download caption: ${response.statusText}`);
      }
      
      const xmlContent = await response.text();
      
      // 解析 YouTube 的 XML 字幕格式并转换为纯文本
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
  static async getAudioStreamUrl(videoId: string): Promise<string> {
    try {
      const info = await ytdl.getInfo(videoId);
      
      // 选择最佳音频格式
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      if (audioFormats.length === 0) {
        throw new Error('No audio formats available');
      }

      // 优先选择高质量音频
      const bestFormat = audioFormats.sort((a, b) => {
        const aQuality = parseInt(String(a.audioBitrate || '0'));
        const bQuality = parseInt(String(b.audioBitrate || '0'));
        return bQuality - aQuality;
      })[0];

      return bestFormat.url;
    } catch (error) {
      console.error('Error getting audio stream:', error);
      throw new Error('Failed to get audio stream');
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
    // 简单的XML解析，提取文本内容
    const textRegex = /<text[^>]*>([^<]+)<\/text>/g;
    const matches = [];
    let match;

    while ((match = textRegex.exec(xmlContent)) !== null) {
      // 解码HTML实体
      const text = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      matches.push(text.trim());
    }

    return matches.join(' ');
  }

  /**
   * 将字幕转换为 SRT 格式
   */
  static async convertCaptionToSRT(captionUrl: string): Promise<string> {
    try {
      // 添加格式参数以获取带时间戳的字幕
      const timedCaptionUrl = captionUrl + '&fmt=srv3';
      const response = await fetch(timedCaptionUrl);
      const xmlContent = await response.text();

      return this.parseXMLToSRT(xmlContent);
    } catch (error) {
      console.error('Error converting caption to SRT:', error);
      throw new Error('Failed to convert caption to SRT');
    }
  }

  /**
   * 解析 XML 字幕为 SRT 格式
   */
  private static parseXMLToSRT(xmlContent: string): string {
    const textRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]+)<\/text>/g;
    const srtEntries = [];
    let match;
    let index = 1;

    while ((match = textRegex.exec(xmlContent)) !== null) {
      const startTime = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      const endTime = startTime + duration;
      
      const text = match[3]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
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