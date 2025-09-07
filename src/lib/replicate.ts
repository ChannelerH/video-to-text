import Replicate from 'replicate';

export interface TranscriptionOptions {
  language?: string;
  model?: 'large-v2' | 'large-v3';
  temperature?: number;
  patience?: number;
  userTier?: string; // 用户等级
  isPreview?: boolean; // 是否为预览请求
  fallbackEnabled?: boolean; // 是否启用降级
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
  srtText?: string; // 原始 SRT 格式文本，带时间戳
}

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

interface ModelInfo {
  id: string;
  name: string;
  speed: string;
  costPerMinute: number;
}

export class ReplicateService {
  private replicate: Replicate;

  constructor(apiToken: string) {
    this.replicate = new Replicate({
      auth: apiToken,
    });
  }

  /**
   * 根据用户等级选择最佳模型
   */
  private getModelByUserTier(_userTier?: string, _isPreview?: boolean): ModelInfo {
    // 仅保留 openai/whisper 一个系列（统一模型策略）
    return {
      id: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
      name: 'Standard Whisper',
      speed: '8-10 minutes',
      costPerMinute: 0.0045
    };
  }

  /**
   * 获取降级模型（当主模型失败时使用）
   */
  private getFallbackModel(): ModelInfo {
    return {
      id: 'openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
      name: 'Standard Whisper (Fallback)',
      speed: '8-10 minutes',
      costPerMinute: 0.0045
    };
  }

  /**
   * 使用 Whisper 转录音频
   * 
   * API 使用的模型：openai/whisper
   * 费用：约每分钟 $0.0045
   */
  async transcribeAudio(
    audioUrl: string, 
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    // 尝试使用主模型
    try {
      return await this.transcribeWithModel(audioUrl, options, false);
    } catch (error) {
      console.error('Primary model failed:', error);
      
      // 如果启用了降级且不是预览请求，尝试使用降级模型
      if (options.fallbackEnabled && !options.isPreview) {
        console.log('Attempting fallback to standard model...');
        try {
          return await this.transcribeWithModel(audioUrl, options, true);
        } catch (fallbackError) {
          console.error('Fallback model also failed:', fallbackError);
          throw new Error('All transcription models failed. Please try again later.');
        }
      }
      
      throw error;
    }
  }

  /**
   * 使用指定模型进行转录
   */
  private async transcribeWithModel(
    audioUrl: string,
    options: TranscriptionOptions,
    useFallback: boolean
  ): Promise<TranscriptionResult> {
    try {
      // 根据用户等级选择模型
      const modelInfo = useFallback 
        ? this.getFallbackModel() 
        : this.getModelByUserTier(options.userTier, options.isPreview);
      
      // 统一：仅 openai/whisper 输入参数
      let input: any = {
        audio: audioUrl,
        // 兼容某些版本提示 audio_file 必填的问题
        audio_file: audioUrl,
        model: options.model || 'large-v3',
        language: options.language === 'auto' ? undefined : options.language,
        translate: false,
        temperature: options.temperature || 0,
        transcription: "plain text",
        suppress_tokens: "-1",
        logprob_threshold: -1,
        no_speech_threshold: 0.6,
        condition_on_previous_text: true,
        compression_ratio_threshold: 2.4,
        temperature_increment_on_fallback: 0.2,
        word_timestamps: true
      };

      console.log(`Starting transcription with ${modelInfo.name} (${options.userTier || 'free'} tier)...`);
      console.log(`Model ID: ${modelInfo.id}`);
      console.log(`Is Preview: ${options.isPreview}`);
      console.log(`Fallback Enabled: ${options.fallbackEnabled}`);
      console.log(`Input parameters:`, input);
      
      let output: any;
      try {
        output = await this.replicate.run(
          modelInfo.id as `${string}/${string}:${string}`,
          { input }
        );
      } catch (err: any) {
        const msg = String(err?.message || err);
        // 针对 422 且提示 audio_file is required 的兼容重试
        if (msg.includes('audio_file is required')) {
          console.warn('Replicate run failed: audio_file required. Retrying with audio_file only...');
          const fallbackInput = { ...input };
          delete (fallbackInput as any).audio;
          (fallbackInput as any).audio_file = audioUrl;
          output = await this.replicate.run(
            modelInfo.id as `${string}/${string}:${string}`,
            { input: fallbackInput }
          );
        } else {
          throw err;
        }
      }

      console.log(`Replicate API response:`, output);

      // 检查输出是否为空或null
      if (!output) {
        throw new Error('Replicate API returned null response. This may be due to an invalid audio file or network issues.');
      }

      // 检查输出格式是否正确
      if (typeof output !== 'object' && typeof output !== 'string') {
        console.error('Unexpected output format:', typeof output, output);
        throw new Error('Replicate API returned unexpected response format');
      }

      // 根据实际返回格式解析数据
      let transcription, segments, detected_language;
      
      // 兼容：有些 cog 返回 SRT URL 字符串
      if (typeof output === 'string') {
        console.log('Processing SRT output from URL');
        
        // output 是一个 URL，需要下载 SRT 文件
        try {
          const srtResponse = await fetch(output);
          const srtContent = await srtResponse.text();
          console.log('Downloaded SRT content length:', srtContent.length);
          
          // 解析 SRT 内容
          const parsedSRT = this.parseSRT(srtContent);
          transcription = parsedSRT.text;
          segments = parsedSRT.segments;
          detected_language = options.language || 'unknown';
        } catch (fetchError) {
          console.error('Failed to fetch SRT from URL:', fetchError);
          throw new Error('Failed to download transcription result');
        }
      } else if (output.output) {
        // 嵌套格式 (如你之前提供的示例)
        console.log('Using nested format: output.output');
        ({ transcription, segments, detected_language } = output.output);
      } else {
        // 直接格式 (实际API返回)
        console.log('Using direct format: output');
        ({ transcription, segments, detected_language } = output);
      }

      console.log('Parsed data:', { transcription, segments: segments?.length, detected_language });

      // 解析输出结果
      const result: TranscriptionResult = {
        text: transcription || '',
        segments: segments || [],
        language: detected_language || 'unknown',
        duration: this.calculateDuration(segments || [])
      };

      // 检查是否有实际的转录内容
      if (!result.text && (!result.segments || result.segments.length === 0)) {
        throw new Error('No transcription content was generated. Please ensure the audio file is valid and contains speech.');
      }

      console.log(`Transcription completed. Language: ${result.language}, Duration: ${result.duration}s`);
      
      return result;
    } catch (error) {
      console.error('Replicate transcription error:', error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  /**
   * 解析 SRT 格式内容
   */
  private parseSRT(srtContent: string): { text: string; segments: TranscriptionSegment[] } {
    const lines = srtContent.split('\n').map(line => line.trim());
    const segments: TranscriptionSegment[] = [];
    let fullText = '';
    let i = 0;
    let segmentId = 0;

    while (i < lines.length) {
      // 跳过空行
      if (!lines[i]) {
        i++;
        continue;
      }

      // 跳过序号行
      if (/^\d+$/.test(lines[i])) {
        i++;
        
        // 解析时间戳
        if (i < lines.length && lines[i].includes('-->')) {
          const [startTime, endTime] = lines[i].split('-->').map(t => t.trim());
          const startSeconds = this.srtTimeToSeconds(startTime);
          const endSeconds = this.srtTimeToSeconds(endTime);
          i++;

          // 收集文本行（可能有多行）
          let text = '';
          while (i < lines.length && lines[i] && !/^\d+$/.test(lines[i])) {
            text += (text ? ' ' : '') + lines[i];
            i++;
          }

          if (text) {
            segments.push({
              id: segmentId++,
              seek: 0,
              start: startSeconds,
              end: endSeconds,
              text: text,
              tokens: [],
              temperature: 0,
              avg_logprob: 0,
              compression_ratio: 1,
              no_speech_prob: 0
            });
            
            fullText += (fullText ? ' ' : '') + text;
          }
        }
      } else {
        i++;
      }
    }

    // 优化标点符号
    fullText = this.optimizePunctuation(fullText);

    return {
      text: fullText,
      segments
    };
  }

  /**
   * 将 SRT 时间格式转换为秒数
   */
  private srtTimeToSeconds(srtTime: string): number {
    // 格式: HH:MM:SS,mmm 或 MM:SS,mmm
    const parts = srtTime.replace(',', '.').split(':');
    
    if (parts.length === 3) {
      // HH:MM:SS.mmm
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      // MM:SS.mmm
      const minutes = parseFloat(parts[0]);
      const seconds = parseFloat(parts[1]);
      return minutes * 60 + seconds;
    } else {
      // SS.mmm
      return parseFloat(srtTime.replace(',', '.'));
    }
  }

  /**
   * 将转录结果转换为 SRT 格式
   */
  convertToSRT(transcription: TranscriptionResult): string {
    if (!transcription.segments || transcription.segments.length === 0) {
      return '';
    }

    return transcription.segments
      .map((segment, index) => {
        const startTime = this.secondsToSRTTime(segment.start);
        const endTime = this.secondsToSRTTime(segment.end);
        const text = this.optimizePunctuation(segment.text.trim());

        return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
      })
      .join('\n');
  }

  /**
   * 将转录结果转换为 VTT 格式
   */
  convertToVTT(transcription: TranscriptionResult): string {
    const srt = this.convertToSRT(transcription);
    if (!srt) return 'WEBVTT\n\n';

    // 将 SRT 转换为 VTT 格式
    const vttContent = srt
      .replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2') // 将逗号替换为点
      .split('\n\n')
      .filter(block => block.trim())
      .map(block => {
        const lines = block.split('\n');
        if (lines.length >= 3) {
          // 移除序号行，只保留时间戳和文本
          return lines.slice(1).join('\n');
        }
        return block;
      })
      .join('\n\n');

    return `WEBVTT\n\n${vttContent}`;
  }

  /**
   * 将转录结果转换为纯文本（优化标点符号）
   */
  convertToPlainText(transcription: TranscriptionResult): string {
    let text = transcription.text.trim();
    // 标点符号优化
    text = this.optimizePunctuation(text);
    // 中文：按句分行，增强可读性（不改词）
    if ((transcription.language || '').toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(text)) {
      text = text
        .replace(/([。！？；])(”|’|）|】)?/g, (_m, p1, p2) => `${p1}${p2 || ''}\n`)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    return text;
  }

  /**
   * 优化文本中的标点符号
   */
  private optimizePunctuation(text: string): string {
    // 1. 去除标点符号前的多余空格
    text = text.replace(/\s+([.!?,:;])/g, '$1');
    
    // 2. 确保句子结束标点后有适当空格
    text = text.replace(/([.!?])\s*([A-Z])/g, '$1 $2');
    
    // 3. 优化逗号和分号后的空格
    text = text.replace(/([,:;])\s*([a-zA-Z])/g, '$1 $2');
    
    // 4. 处理引号内的标点
    text = text.replace(/([""'])\s+([.!?])/g, '$2$1');
    text = text.replace(/([.!?])\s+([""'])/g, '$1$2');
    
    // 5. 处理中文标点符号
    text = text.replace(/\s*([。！？，；：])\s*/g, '$1');
    text = text.replace(/([。！？])\s*([A-Za-z\u4e00-\u9fff])/g, '$1 $2');
    
    // 6. 清理多余的空格
    text = text.replace(/\s+/g, ' ');
    
    // 7. 确保首字母大写（英文）
    text = text.replace(/^\s*([a-z])/g, (match, p1) => match.replace(p1, p1.toUpperCase()));
    
    return text.trim();
  }

  /**
   * 将转录结果转换为 JSON 格式
   */
  convertToJSON(transcription: TranscriptionResult): string {
    return JSON.stringify(transcription, null, 2);
  }

  /**
   * 将转录结果转换为 Markdown 格式
   */
  convertToMarkdown(transcription: TranscriptionResult, videoTitle?: string): string {
    let markdown = '';
    
    if (videoTitle) {
      markdown += `# ${videoTitle}\n\n`;
    }
    
    markdown += `## Transcription\n\n`;
    markdown += `**Language:** ${transcription.language}\n`;
    markdown += `**Duration:** ${Math.round(transcription.duration)}s\n\n`;
    markdown += `### Content\n\n`;
    
    if (transcription.segments && transcription.segments.length > 0) {
      transcription.segments.forEach((segment) => {
        const timestamp = this.secondsToTimestamp(segment.start);
        const text = this.optimizePunctuation(segment.text.trim());
        markdown += `**[${timestamp}]** ${text}\n\n`;
      });
    } else {
      markdown += this.optimizePunctuation(transcription.text);
    }

    return markdown;
  }

  /**
   * 估算转录费用（美元）
   */
  estimateCost(durationInSeconds: number): number {
    const pricePerMinute = 0.0045; // Replicate Whisper 定价
    const minutes = durationInSeconds / 60;
    return Math.ceil(minutes) * pricePerMinute;
  }

  /**
   * 计算转录总时长
   */
  private calculateDuration(segments: TranscriptionSegment[]): number {
    if (segments.length === 0) return 0;
    const lastSegment = segments[segments.length - 1];
    return lastSegment.end;
  }

  /**
   * 将秒数转换为 SRT 时间格式 (HH:MM:SS,mmm)
   */
  private secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * 将秒数转换为时间戳格式 (MM:SS)
   */
  private secondsToTimestamp(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
