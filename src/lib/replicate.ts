import Replicate from 'replicate';

export interface TranscriptionOptions {
  language?: string;
  model?: 'large-v2' | 'large-v3';
  temperature?: number;
  patience?: number;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
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

export class ReplicateService {
  private replicate: Replicate;

  constructor(apiToken: string) {
    this.replicate = new Replicate({
      auth: apiToken,
    });
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
    try {
      const input = {
        audio: audioUrl,
        model: options.model || 'large-v3',
        language: options.language === 'auto' ? undefined : options.language, // 自动检测语言时不传language参数
        translate: false,
        temperature: options.temperature || 0,
        transcription: "plain text", // 返回纯文本格式
        suppress_tokens: "-1",
        logprob_threshold: -1,
        no_speech_threshold: 0.6,
        condition_on_previous_text: true,
        compression_ratio_threshold: 2.4,
        temperature_increment_on_fallback: 0.2
      };

      console.log(`Starting transcription with Replicate Whisper...`);
      console.log(`Input parameters:`, input);
      
      const output = await this.replicate.run(
        "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
        { input }
      ) as any;

      console.log(`Replicate API response:`, output);

      // 检查输出是否为空或null
      if (!output) {
        throw new Error('Replicate API returned null response. This may be due to an invalid audio file or network issues.');
      }

      // 检查输出格式是否正确
      if (typeof output !== 'object') {
        console.error('Unexpected output format:', typeof output, output);
        throw new Error('Replicate API returned unexpected response format');
      }

      // 根据实际返回格式解析数据
      let transcription, segments, detected_language;
      
      if (output.output) {
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
        const text = segment.text.trim();

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
   * 将转录结果转换为纯文本
   */
  convertToPlainText(transcription: TranscriptionResult): string {
    return transcription.text.trim();
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
      transcription.segments.forEach((segment, index) => {
        const timestamp = this.secondsToTimestamp(segment.start);
        markdown += `**[${timestamp}]** ${segment.text.trim()}\n\n`;
      });
    } else {
      markdown += transcription.text;
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