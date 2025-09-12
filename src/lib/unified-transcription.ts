import { ReplicateService, TranscriptionResult, TranscriptionOptions } from './replicate';
import { DeepgramService, DeepgramOptions } from './deepgram';

export interface UnifiedTranscriptionOptions extends TranscriptionOptions {
  highAccuracyMode?: boolean;
  outputFormat?: 'json' | 'srt'; // 选择输出格式
  // 语言探针：若 language 未指定/为 auto，则先用前 N 秒进行探测
  languageProbeSeconds?: number; // 默认 10 秒
  forceChinese?: boolean; // 前端已探针判定中文时强制走中文路径
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
    
    // Only PRO + highAccuracy may use Whisper directly
    if (userTier === 'pro' && highAccuracyMode && !isPreview) {
      console.log('🎯 High accuracy mode (PRO): Using Whisper directly');
      return {
        primary: 'whisper',
        fallback: null,
        sloTimeout: 60000
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

    // Default: everyone uses Deepgram. Non‑PRO users never auto‑fallback to Whisper.
    return {
      primary: 'deepgram',
      fallback: userTier === 'pro' && !isPreview ? 'whisper' : null,
      sloTimeout
    };
  }

  /**
   * Quick language probe using Deepgram (first N seconds)
   */
  async probeLanguage(audioUrl: string, options: UnifiedTranscriptionOptions): Promise<{ language: string; isChinese: boolean }> {
    if (!this.deepgramService) {
      // 无 Deepgram 时无法探针，回退到 unknown
      return { language: options.language || 'unknown', isChinese: false };
    }

    const probeSeconds = Math.max(8, Math.min(12, options.languageProbeSeconds || 10));
    try {
      const res = await this.deepgramService.transcribeAudio(audioUrl, {
        language: 'auto',
        isPreview: false,
        userTier: options.userTier,
        highAccuracyMode: false,
        probeSeconds
      });

      const detected = res.language || 'unknown';
      const hasChinese = detected.toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(res.text || '');
      console.log(`🧪 Language probe (${probeSeconds}s):`, { detected, hasChinese });
      return { language: detected, isChinese: hasChinese };
    } catch (e) {
      console.warn('Language probe failed, falling back to default strategy:', e);
      return { language: options.language || 'unknown', isChinese: false };
    }
  }

  /**
   * Main transcription method with SLO-based fallback
   */
  async transcribeAudio(
    audioUrl: string,
    options: UnifiedTranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    let strategy: TranscriptionStrategy;
    const startTime = Date.now();
    
    // Pro/Premium + high accuracy (non-preview): force Whisper before any probe/strategy
    if ((options.userTier === 'pro')
      && options.highAccuracyMode
      && !options.isPreview) {
      console.log('🎯 High accuracy mode: Using Whisper directly');
      const result = await this.transcribeWithModel(audioUrl, options, 'whisper');
      const duration = Date.now() - startTime;
      console.log(`✅ whisper (High accuracy) succeeded in ${Math.round(duration / 1000)}s`);
      return result;
    }
    
    // 语言探针：仅在 language 未指定或 auto 时进行
    let isChinese = !!options.forceChinese;
    if (!isChinese && (!options.language || options.language === 'auto')) {
      const probe = await this.probeLanguage(audioUrl, options);
      isChinese = probe.isChinese;
    }

    // 基于探针结果选择模型：非 PRO 一律 Deepgram（若可用）。只有 PRO+highAccuracy 才使用 Whisper。
    if (this.deepgramService) {
      strategy = { primary: 'deepgram', fallback: (options.userTier === 'pro' && !options.isPreview) ? 'whisper' : null, sloTimeout: options.isPreview ? 30000 : 60000 };
    } else {
      // Deepgram 不可用时，统一走 Whisper（兜底）
      strategy = { primary: 'whisper', fallback: null, sloTimeout: options.isPreview ? 60000 : 90000 };
    }

    console.log(`🚀 Transcription strategy (after probe):`);
    console.log(`  Primary: ${strategy.primary}`);
    console.log(`  Fallback: ${strategy.fallback || 'none'}`);
    console.log(`  SLO timeout: ${strategy.sloTimeout / 1000}s`);
    console.log(`  User tier: ${options.userTier || 'free'}`);
    console.log(`  Language: ${options.language || 'auto'}${isChinese ? ' (Chinese detected)' : ''}`);
    console.log('[TEST][YT-003/HA-001] strategy', { primary: strategy.primary, fallback: strategy.fallback, highAccuracy: options.highAccuracyMode, userTier: options.userTier, isPreview: options.isPreview });

    // 仅当明确选择 Whisper（PRO+高精度或无 Deepgram）时走 Whisper 特殊路径
    if (strategy.primary === 'whisper') {
      try {
        const result = await this.transcribeWithModel(audioUrl, options, 'whisper');
        const duration = Date.now() - startTime;
        console.log(`✅ whisper succeeded in ${duration / 1000}s`);
        return result;
      } catch (err) {
        console.warn('⚠️ whisper failed. Falling back to Deepgram if available...', err);
        if (this.deepgramService) {
          return await this.transcribeWithModel(audioUrl, options, 'deepgram');
        }
        throw err;
      }
    }

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
      console.warn('[TEST][YT-003] slo_exceeded_or_failed', { primary: strategy.primary, durationMs: duration });

      // Try fallback if available
      if (strategy.fallback && options.fallbackEnabled !== false) {
        console.log(`🔄 Falling back to ${strategy.fallback}...`);
        console.log('[TEST][YT-003] fallback.start', { fallback: strategy.fallback });
        
        try {
          const fallbackResult = await this.transcribeWithModel(
            audioUrl,
            options,
            strategy.fallback
          );
          
          const totalDuration = Date.now() - startTime;
          console.log(`✅ ${strategy.fallback} fallback succeeded in ${totalDuration / 1000}s total`);
          console.log('[TEST][YT-003] fallback.ok', { totalSec: totalDuration / 1000 });
          
          return fallbackResult;
          
        } catch (fallbackError) {
          console.error(`❌ ${strategy.fallback} fallback also failed:`, fallbackError);
          console.error('[TEST][YT-003] fallback.failed');
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

      let deepgramOptions: DeepgramOptions = {
        language: options.language,
        userTier: options.userTier,
        isPreview: options.isPreview,
        highAccuracyMode: options.highAccuracyMode,
        outputFormat: options.outputFormat
      };

      // First pass with auto-detect unless user forced a language
      const first = await this.deepgramService.transcribeAudio(audioUrl, deepgramOptions);

      // Heuristic: if Deepgram mislabeled as zh but text is overwhelmingly ASCII/English, re-run with language='en'
      const text = (first.text || '').trim();
      const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const latinCount = (text.match(/[A-Za-z]/g) || []).length;
      const zhLabelled = (first.language || '').toLowerCase().includes('zh');
      const englishLike = latinCount > 50 && cjkCount === 0; // long enough English text with no CJK

      if (!options.language && zhLabelled && englishLike && !options.isPreview) {
        try {
          console.warn('[LangGuard] Deepgram labelled as zh but text looks English. Re-running with language=en');
          deepgramOptions = { ...deepgramOptions, language: 'en' };
          const second = await this.deepgramService.transcribeAudio(audioUrl, deepgramOptions);
          // Prefer the one with longer alphabetic content
          const latin2 = (second.text || '').match(/[A-Za-z]/g)?.length || 0;
          return latin2 >= latinCount ? second : first;
        } catch (e) {
          console.warn('[LangGuard] Fallback en-run failed, using first result', e);
          return first;
        }
      }

      return first;
      
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
   * Overlay diarization (speaker labels) onto existing sentence-level segments using Deepgram.
   * Does not change text; only assigns segment.speaker by maximal time overlap with utterances/word speakers.
   */
  async addDiarizationFromUrl(audioUrl: string, transcription: TranscriptionResult): Promise<boolean> {
    if (!this.deepgramService) return false;
    try {
      const dg = await this.deepgramService.transcribeAudio(audioUrl, {
        language: transcription.language || 'auto',
        isPreview: false,
        outputFormat: 'json'
      } as any);
      const altSegs: any[] = dg.segments || [];
      if (!altSegs.some((s: any) => s.speaker != null)) return false;
      // Assign speaker by overlap for each sentence in existing transcription
      (transcription.segments as any[]).forEach((sent: any) => {
        let bestSpeaker: string | undefined;
        let best = 0;
        for (const s of altSegs) {
          if (s.speaker == null) continue;
          const a = Math.max(sent.start, s.start);
          const b = Math.min(sent.end, s.end);
          const overlap = Math.max(0, b - a);
          if (overlap > best) { best = overlap; bestSpeaker = String(s.speaker); }
        }
        if (bestSpeaker) sent.speaker = bestSpeaker;
      });
      return true;
    } catch (e) {
      console.warn('[Overlay] diarization overlay failed:', e);
      return false;
    }
  }

  /**
   * Convert transcription to plain text
   */
  convertToPlainText(transcription: TranscriptionResult): string {
    try {
      // If diarization exists, provide a simple speaker-prefixed text (one per segment)
      if (Array.isArray(transcription.segments) && transcription.segments.some((s: any) => s && (s as any).speaker)) {
        const lines = transcription.segments.map((s: any) => {
          const sp = s.speaker;
          const label = (typeof sp === 'string' && /^\d+$/.test(sp)) ? `Speaker ${parseInt(sp) + 1}` : (sp ? String(sp) : '');
          const prefix = label ? `${label}: ` : '';
          return prefix + String(s.text || '').trim();
        });
        return lines.join('\n');
      }
      const isZh = (transcription.language || '').toLowerCase().includes('zh') || /[\u4e00-\u9fff]/.test(transcription.text || '');
      if (isZh) {
        const raw = (transcription.text || '').trim();
        const cjkCount = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
        const punctCount = (raw.match(/[，。！？；：]/g) || []).length;
        const hasEnoughPunct = punctCount >= Math.max(6, Math.floor(cjkCount / 40));
        const splitSentences = (t: string) => t
          .replace(/([。！？；])(”|’|）|】)?/g, (_m, p1, p2) => `${p1}${p2 || ''}\n`)
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (hasEnoughPunct) return splitSentences(raw);
        // 否则回退到 segments 拼接 + 轻量规范，确保可读
        if (Array.isArray(transcription.segments) && transcription.segments.length > 0) {
          const joined = transcription.segments.map(s => String(s.text || '').trim()).join('');
          const normalized = joined
            .replace(/[\t\r\f]+/g, ' ').replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ')
            .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
            .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
            .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
            .replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，')
            .replace(/([\u4e00-\u9fff])\s*\.\s*/g, '$1。')
            .replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；')
            .replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：')
            .replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！')
            .replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？')
            .replace(/\s*([，。！？；：、“”‘’（）：])\s*/g, '$1')
            .trim();
          return splitSentences(normalized);
        }
      }
    } catch {}
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
