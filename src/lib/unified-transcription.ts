import { ReplicateService, TranscriptionResult, TranscriptionOptions } from './replicate';
import { DeepgramService, DeepgramOptions } from './deepgram';

export interface UnifiedTranscriptionOptions extends TranscriptionOptions {
  highAccuracyMode?: boolean;
  outputFormat?: 'json' | 'srt'; // 选择输出格式
}

interface TranscriptionStrategy {
  primary: 'deepgram' | 'whisper';
  fallback: 'deepgram' | 'whisper' | null;
  sloTimeout: number; // milliseconds
}

export class UnifiedTranscriptionService {
  private replicateService: ReplicateService;
  private deepgramService?: DeepgramService;
  
  constructor(replicateApiToken: string, deepgramApiKey?: string) {
    this.replicateService = new ReplicateService(replicateApiToken);
    
    if (deepgramApiKey) {
      this.deepgramService = new DeepgramService(deepgramApiKey);
      console.log('✅ Dual-model strategy enabled: Deepgram Nova-2 + OpenAI Whisper');
    } else {
      console.log('⚠️ Single-model strategy: OpenAI Whisper only (Deepgram API key not provided)');
    }
  }

  /**
   * Get transcription strategy based on user tier and options
   */
  private getStrategy(options: UnifiedTranscriptionOptions): TranscriptionStrategy {
    const { userTier, isPreview, highAccuracyMode } = options;
    
    // Pro users with high accuracy mode: direct to Whisper
    if (userTier === 'pro' && highAccuracyMode && !isPreview) {
      console.log('🎯 High accuracy mode: Using Whisper directly');
      return {
        primary: 'whisper',
        fallback: null,
        sloTimeout: 60000 // 60 seconds for Whisper
      };
    }

    // If Deepgram is not available, use Whisper only
    if (!this.deepgramService) {
      return {
        primary: 'whisper',
        fallback: null,
        sloTimeout: isPreview ? 30000 : 60000
      };
    }

    // Default strategy: Deepgram Nova-2 with SLO-based fallback to Whisper
    let sloTimeout: number;
    
    switch (userTier) {
      case 'pro':
      case 'premium':
        sloTimeout = 30000; // 30 seconds
        break;
      case 'basic':
        sloTimeout = 60000; // 60 seconds
        break;
      case 'free':
      default:
        sloTimeout = 45000; // 45 seconds
        break;
    }

    // Preview mode gets shorter timeout
    if (isPreview) {
      sloTimeout = Math.min(sloTimeout, 15000); // Max 15 seconds for preview
    }

    return {
      primary: 'deepgram',
      fallback: 'whisper',
      sloTimeout
    };
  }

  /**
   * Main transcription method with SLO-based fallback
   */
  async transcribeAudio(
    audioUrl: string,
    options: UnifiedTranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const strategy = this.getStrategy(options);
    const startTime = Date.now();
    
    console.log(`🚀 Transcription strategy:`);
    console.log(`  Primary: ${strategy.primary}`);
    console.log(`  Fallback: ${strategy.fallback || 'none'}`);
    console.log(`  SLO timeout: ${strategy.sloTimeout / 1000}s`);
    console.log(`  User tier: ${options.userTier || 'free'}`);
    console.log(`  Language: ${options.language || 'auto'}`);

    try {
      // Try primary model with SLO timeout
      const result = await this.runWithTimeout(
        this.transcribeWithModel(audioUrl, options, strategy.primary),
        strategy.sloTimeout,
        `${strategy.primary} exceeded SLO of ${strategy.sloTimeout / 1000}s`
      );

      const duration = Date.now() - startTime;
      console.log(`✅ ${strategy.primary} succeeded in ${duration / 1000}s`);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(`⚠️ ${strategy.primary} failed after ${duration / 1000}s:`, (error as Error).message);

      // Try fallback if available
      if (strategy.fallback && options.fallbackEnabled !== false) {
        console.log(`🔄 Falling back to ${strategy.fallback}...`);
        
        try {
          const fallbackResult = await this.transcribeWithModel(
            audioUrl,
            options,
            strategy.fallback
          );
          
          const totalDuration = Date.now() - startTime;
          console.log(`✅ ${strategy.fallback} fallback succeeded in ${totalDuration / 1000}s total`);
          
          return fallbackResult;
          
        } catch (fallbackError) {
          console.error(`❌ ${strategy.fallback} fallback also failed:`, fallbackError);
          throw new Error('All transcription models failed. Please try again later.');
        }
      }

      throw error;
    }
  }

  /**
   * Transcribe with specific model
   */
  private async transcribeWithModel(
    audioUrl: string,
    options: UnifiedTranscriptionOptions,
    model: 'deepgram' | 'whisper'
  ): Promise<TranscriptionResult> {
    if (model === 'deepgram') {
      if (!this.deepgramService) {
        throw new Error('Deepgram service not available');
      }

      const deepgramOptions: DeepgramOptions = {
        language: options.language,
        userTier: options.userTier,
        isPreview: options.isPreview,
        highAccuracyMode: options.highAccuracyMode,
        outputFormat: options.outputFormat
      };

      return await this.deepgramService.transcribeAudio(audioUrl, deepgramOptions);
      
    } else {
      // Use Replicate (Whisper)
      return await this.replicateService.transcribeAudio(audioUrl, options);
    }
  }

  /**
   * Run promise with timeout
   */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      })
    ]);
  }

  /**
   * Convert transcription to SRT format
   */
  convertToSRT(transcription: TranscriptionResult): string {
    // 如果有原始的 SRT 文本（来自 Deepgram），直接返回
    if (transcription.srtText) {
      return transcription.srtText;
    }
    
    // 否则，从 segments 生成 SRT
    if (!transcription.segments || transcription.segments.length === 0) {
      return '';
    }

    return transcription.segments
      .map((segment, index) => {
        const startTime = this.secondsToSRTTime(segment.start);
        const endTime = this.secondsToSRTTime(segment.end);
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
      })
      .join('\n');
  }

  /**
   * Convert transcription to VTT format
   */
  convertToVTT(transcription: TranscriptionResult): string {
    const srt = this.convertToSRT(transcription);
    if (!srt) return 'WEBVTT\n\n';

    // Convert SRT to VTT format
    const vttContent = srt
      .replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2') // Replace comma with dot in timestamps
      .split('\n\n')
      .map(block => {
        const lines = block.split('\n');
        if (lines.length >= 3) {
          // Remove the index number (first line)
          return lines.slice(1).join('\n');
        }
        return block;
      })
      .join('\n\n');

    return `WEBVTT\n\n${vttContent}`;
  }

  /**
   * Convert transcription to plain text
   */
  convertToPlainText(transcription: TranscriptionResult): string {
    return transcription.text.trim();
  }

  /**
   * Convert transcription to JSON
   */
  convertToJSON(transcription: TranscriptionResult): string {
    return JSON.stringify(transcription, null, 2);
  }

  /**
   * Convert transcription to Markdown
   */
  convertToMarkdown(transcription: TranscriptionResult, title?: string): string {
    let markdown = '';
    
    if (title) {
      markdown += `# ${title}\n\n`;
    }
    
    markdown += `## Transcription\n\n`;
    markdown += `**Language:** ${transcription.language}\n`;
    markdown += `**Duration:** ${Math.round(transcription.duration)}s\n\n`;
    markdown += `### Content\n\n`;
    
    if (transcription.segments && transcription.segments.length > 0) {
      transcription.segments.forEach(segment => {
        const timestamp = this.secondsToTimestamp(segment.start);
        markdown += `**[${timestamp}]** ${segment.text.trim()}\n\n`;
      });
    } else {
      markdown += transcription.text;
    }

    return markdown;
  }

  /**
   * Estimate transcription cost
   */
  estimateCost(durationInSeconds: number, useDeepgram: boolean = true): number {
    if (useDeepgram && this.deepgramService) {
      return this.deepgramService.estimateCost(durationInSeconds);
    }
    // Fallback to Whisper pricing
    const minutes = durationInSeconds / 60;
    return Math.ceil(minutes) * 0.0045;
  }

  /**
   * Helper: Convert seconds to SRT time format
   */
  private secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Helper: Convert seconds to timestamp
   */
  private secondsToTimestamp(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}