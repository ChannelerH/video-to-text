import { TranscriptionResult, TranscriptionSegment } from './replicate';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface DeepgramOptions {
  language?: string;
  userTier?: string;
  isPreview?: boolean;
  highAccuracyMode?: boolean;
  outputFormat?: 'json' | 'srt'; // 输出格式选择
  probeSeconds?: number; // 语言探针秒数（仅转前N秒）
}

interface DeepgramResponse {
  metadata: {
    transaction_key: string;
    request_id: string;
    sha256: string;
    created: string;
    duration: number;
    channels: number;
    utterances?: Array<{
      start: number;
      end: number;
      transcript: string;
      speaker: number | string;
      words?: Array<{ start: number; end: number; word: string; speaker?: number | string }>;
    }>;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
          punctuated_word: string;
          language?: string; // For multi-language detection
        }>;
        paragraphs?: {
          transcript: string;
          paragraphs: Array<{
            sentences: Array<{
              text: string;
              start: number;
              end: number;
            }>;
            num_words: number;
            start: number;
            end: number;
          }>;
        };
        languages?: string[]; // Detected languages
      }>;
      detected_language?: string; // Primary detected language
    }>;
  };
}

export class DeepgramService {
  private apiKey: string;
  private apiUrl = 'https://api.deepgram.com/v1/listen';
  private DEBUG = process.env.DEBUG_TRANSCRIPTION === 'true';
  private DEBUG_RAW = process.env.DEBUG_DEEPGRAM_RAW === 'true';
  private DEBUG_TO_FILE = process.env.DEBUG_DEEPGRAM_RAW_FILE === 'true';

  private async writeDebugFile(kind: 'raw' | 'parsed' | 'snapshot', data: any) {
    if (!this.DEBUG_TO_FILE) return;
    try {
      const dir = path.join(process.cwd(), '.debug', 'raw-deepgram');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const id = crypto.randomBytes(4).toString('hex');
      const file = path.join(dir, `dg-${ts}-${id}-${kind}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // Silently ignore file I/O errors during debugging
    }
  }

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Transcribe audio using Deepgram Nova-2
   * Supports language detection and code-switching
   * Can output in JSON or SRT format for direct display
   */
  async transcribeAudio(
    audioUrl: string,
    options: DeepgramOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      
      // Build query parameters
      const params = new URLSearchParams({
        model: 'nova-2', // Using Nova-2 as specified
        punctuate: 'true',
        smart_format: 'true',
        utterances: 'true',
        paragraphs: 'true', // 获取段落信息
        diarize: 'true', // enable speaker diarization
        numerals: 'true',
        profanity_filter: 'false',
        redact: 'false'
      });

      // Language configuration
      if (options.language === 'auto' || !options.language) {
        // Enable language detection for auto mode
        params.set('detect_language', 'true');
      } else if (options.language === 'multi') {
        // Enable code-switching for mixed languages
        params.set('language', 'multi');
        params.set('endpointing', '100'); // Recommended for code-switching
      } else {
        // Specific language
        params.set('language', options.language);
      }

      // Note: Deepgram does not support partial transcription via start/end on the HTTP API.
      // We perform clipping before calling this API when needed (probe/preview).

      if (this.DEBUG) {
        console.log(`🎯 Deepgram Nova-2 transcription starting...`);
        console.log(`Language mode: ${options.language || 'auto-detect'}`);
        console.log(`User tier: ${options.userTier || 'free'}`);
      }

      const response = await fetch(`${this.apiUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: audioUrl
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Deepgram API error:', response.status, errorText);
        throw new Error(`Deepgram API failed: ${response.status}`);
      }

      // 处理 JSON 格式响应
      const result: DeepgramResponse = await response.json();
      if (this.DEBUG) {
        console.log(`✅ Received JSON response from Deepgram Nova-2`);
      }

      // Optional: print a concise snapshot of Deepgram raw response for debugging
      if (this.DEBUG_RAW) {
        try {
          const ch = result?.results?.channels?.[0] as any;
          const alt = ch?.alternatives?.[0] || {};
          const words = Array.isArray(alt?.words) ? alt.words.slice(0, 8) : [];
          const utterances: any[] = (result as any)?.results?.utterances || [];
          console.log('[DG RAW] Snapshot:', {
            detected_language: ch?.detected_language,
            alt_languages: alt?.languages,
            transcript_len: (alt?.transcript || '').length,
            words_sample: words.map((w: any) => ({ w: w.word, start: w.start, end: w.end, sp: w.speaker })).slice(0, 8),
            utterances_count: utterances.length,
            utterances_sample: utterances.slice(0, 3).map((u: any) => ({ start: u.start, end: u.end, sp: u.speaker, text: (u.transcript || '').slice(0, 80) }))
          });
          await this.writeDebugFile('snapshot', {
            detected_language: ch?.detected_language,
            alt_languages: alt?.languages,
            transcript_len: (alt?.transcript || '').length,
            utterances_count: utterances.length
          });
          await this.writeDebugFile('raw', result);
        } catch (e) {
          console.warn('[DG RAW] Snapshot logging failed:', e);
        }
      }
      
      // Parse response
      const channel = result.results?.channels?.[0];
      if (!channel) {
        console.warn('[Deepgram] No channels in response');
        return {
          success: true,
          transcription: { text: '', segments: [], language: 'unknown', duration: 0 }
        };
      }
      
      const alternative = channel.alternatives?.[0];
      
      // 当 transcript 为空时，尽量从 paragraphs/words 重建，避免直接抛错（用于语言探针尤为重要）
      let transcriptText = (alternative && alternative.transcript) || '';
      if (!alternative) {
        console.warn('[Deepgram] Missing alternatives; returning minimal result');
      }
      
      // 如果 transcript 完全为空，记录警告
      if (!transcriptText || transcriptText.trim().length === 0) {
        console.warn('[Deepgram] Empty transcript returned. This may indicate:');
        console.warn('  - Audio quality issues');
        console.warn('  - Language detection problems');
        console.warn('  - Silent or very quiet audio');
        console.warn(`  - Detected language: ${channel.detected_language || 'unknown'}`);
      }
      
      // 处理中文转录结果中的空格问题
      
      // 检测是否为中文（包含中文字符）
      const containsChinese = /[\u4e00-\u9fff]/.test(transcriptText);
      if (containsChinese) {
        console.log('Detected Chinese content, removing unnecessary spaces...');
        // 移除中文字符之间的空格，但保留英文单词之间的空格
        transcriptText = transcriptText.replace(/([^\x00-\xff])\s+([^\x00-\xff])/g, '$1$2');
        // 移除中文和英文之间的多余空格（保留一个）
        transcriptText = transcriptText.replace(/([^\x00-\xff])\s+([a-zA-Z])/g, '$1 $2');
        transcriptText = transcriptText.replace(/([a-zA-Z])\s+([^\x00-\xff])/g, '$1 $2');
      }
      
      // Convert to segments（若无 alternative，返回空数组）
      let segments = alternative ? this.convertToSegments(alternative) : [];

      // Enrich segments with speaker info using diarization data (utterances or word-level speakers)
      try {
        const utterances = (result.results as any)?.utterances as DeepgramResponse['results']['utterances'] | undefined;
        if (utterances && utterances.length > 0) {
          // Assign speaker based on the utterance that overlaps most with the segment
          segments = segments.map((seg) => {
            let best: { overlap: number; speaker: string | null } = { overlap: 0, speaker: null };
            for (const utt of utterances) {
              const a = Math.max(seg.start, utt.start);
              const b = Math.min(seg.end, utt.end);
              const overlap = Math.max(0, b - a);
              if (overlap > best.overlap) {
                const sp = typeof utt.speaker === 'number' ? String(utt.speaker) : String(utt.speaker || '');
                best = { overlap, speaker: sp };
              }
            }
            return best.speaker ? { ...(seg as any), speaker: best.speaker } : seg;
          });
        } else if ((alternative as any)?.words?.some((w: any) => w && w.speaker !== undefined)) {
          const words: any[] = (alternative as any).words || [];
          segments = segments.map((seg) => {
            const within = words.filter((w) => typeof w.start === 'number' && typeof w.end === 'number' && w.start < seg.end && w.end > seg.start && w.speaker !== undefined);
            if (!within.length) return seg;
            const counts = new Map<string, number>();
            within.forEach((w) => {
              const key = String(w.speaker);
              counts.set(key, (counts.get(key) || 0) + (w.end - w.start));
            });
            let bestSpeaker: string | null = null;
            let bestScore = -1;
            counts.forEach((val, key) => { if (val > bestScore) { bestScore = val; bestSpeaker = key; } });
            return bestSpeaker ? { ...(seg as any), speaker: bestSpeaker } : seg;
          });
        }
      } catch (e) {
        console.warn('[Deepgram] Failed to enrich segments with speaker info:', e);
      }
      
      // Detect primary language
      let detectedLanguage = channel.detected_language || 
                            alternative?.languages?.[0] || 
                            options.language || 
                            'unknown';
      
      const srtText = this.generateSRTFromSegments(segments);
      const transcriptionResult: TranscriptionResult = {
        text: transcriptText,
        segments,
        language: detectedLanguage,
        duration: result.metadata.duration,
        srtText
      };

      if (this.DEBUG_RAW) {
        try {
          console.log('[DG RAW] Parsed result:', {
            language: transcriptionResult.language,
            textLen: transcriptionResult.text.length,
            segments: transcriptionResult.segments.length,
            segSample: transcriptionResult.segments.slice(0, 3).map((s: any) => ({ start: s.start, end: s.end, sp: s.speaker, text: (s.text || '').slice(0, 80) }))
          });
          await this.writeDebugFile('parsed', transcriptionResult);
        } catch {}
      }
      
      if (this.DEBUG) {
        console.log(`✅ Deepgram transcription completed in ${result.metadata.duration}s`);
        console.log(`Detected language: ${detectedLanguage}`);
        console.log(`Text length: ${transcriptText.length} (spaces cleaned for Chinese)`);
      }
      
      return transcriptionResult;

    } catch (error) {
      console.error('Deepgram transcription error:', error);
      throw error;
    }
  }

  /**
   * Generate SRT format from segments
   */
  private generateSRTFromSegments(segments: TranscriptionSegment[]): string {
    if (!segments || segments.length === 0) {
      return '';
    }
    
    return segments
      .map((segment, index) => {
        const startTime = this.secondsToSRTTime(segment.start);
        const endTime = this.secondsToSRTTime(segment.end);
        const sp = (segment as any).speaker;
        const speakerLabel = (typeof sp === 'string' && /^\d+$/.test(sp)) ? `Speaker ${parseInt(sp) + 1}` : (sp ? String(sp) : null);
        const line = speakerLabel ? `${speakerLabel}: ${segment.text.trim()}` : segment.text.trim();
        return `${index + 1}\n${startTime} --> ${endTime}\n${line}\n`;
      })
      .join('\n');
  }
  
  /**
   * Convert seconds to SRT time format
   */
  private secondsToSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Convert Deepgram response to segments
   */
  private convertToSegments(alternative: any): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];

    // Helper function to clean Chinese text
    const cleanChineseText = (text: string): string => {
      const containsChinese = /[\u4e00-\u9fff]/.test(text);
      if (containsChinese) {
        // 移除中文字符之间的空格
        text = text.replace(/([^\x00-\xff])\s+([^\x00-\xff])/g, '$1$2');
        // 移除中文和英文之间的多余空格（保留一个）
        text = text.replace(/([^\x00-\xff])\s+([a-zA-Z])/g, '$1 $2');
        text = text.replace(/([a-zA-Z])\s+([^\x00-\xff])/g, '$1 $2');
        // ASCII 标点 -> 中文标点（在中文邻域）
        text = text
          .replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，')
          .replace(/([\u4e00-\u9fff])\s*\.\s*/g, '$1。')
          .replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；')
          .replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：')
          .replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！')
          .replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？');
        // 引号与括号归一
        text = text.replace(/"([^"]+)"/g, '“$1”').replace(/'([^']+)'/g, '‘$1’')
                   .replace(/\(/g, '（').replace(/\)/g, '）');
      }
      return text;
    };

    // Reconstruct sentence text using words within the sentence window
    const sentenceTextFromWords = (start: number, end: number): string | null => {
      if (!alternative.words || !Array.isArray(alternative.words)) return null;
      const words = alternative.words.filter((w: any) => typeof w.start === 'number' && typeof w.end === 'number' && w.start >= start - 0.02 && w.end <= end + 0.02);
      if (!words.length) return null;
      const joined = words.map((w: any) => w.punctuated_word || w.word).join(' ');
      return cleanChineseText(joined);
    };

    // Use paragraphs if available
    if (alternative.paragraphs?.paragraphs) {
      alternative.paragraphs.paragraphs.forEach((paragraph: any, pIndex: number) => {
        paragraph.sentences.forEach((sentence: any, sIndex: number) => {
          const rebuilt = sentenceTextFromWords(sentence.start, sentence.end) || cleanChineseText(sentence.text);
          if (rebuilt !== sentence.text) {
            console.log(`[Punct][DG] sentence rebuilt with words: ${sentence.start.toFixed(2)}-${sentence.end.toFixed(2)} len=${rebuilt.length}`);
          }
          segments.push({
            id: pIndex * 100 + sIndex,
            seek: 0,
            start: sentence.start,
            end: sentence.end,
            text: rebuilt,
            tokens: [],
            temperature: 0,
            avg_logprob: alternative.confidence || 0,
            compression_ratio: 1,
            no_speech_prob: 0
          });
        });
      });
    } else if (alternative.words) {
      // Create segments from words (fallback)
      let currentSegment: TranscriptionSegment | null = null;
      let segmentId = 0;

      alternative.words.forEach((word: any) => {
        // Create new segment every ~10 seconds or at sentence boundaries
        if (!currentSegment || 
            word.start - currentSegment.start >= 10 ||
            /[.!?]$/.test(currentSegment.text)) {
          
          if (currentSegment) {
            // Clean Chinese text before pushing
            currentSegment.text = cleanChineseText(currentSegment.text);
            segments.push(currentSegment);
          }

          currentSegment = {
            id: segmentId++,
            seek: 0,
            start: word.start,
            end: word.end,
            text: word.punctuated_word || word.word,
            tokens: [],
            temperature: 0,
            avg_logprob: word.confidence || 0,
            compression_ratio: 1,
            no_speech_prob: 0
          };
        } else if (currentSegment) {
          currentSegment.text += ' ' + (word.punctuated_word || word.word);
          currentSegment.end = word.end;
        }
      });

      if (currentSegment != null) {
        // Clean Chinese text before pushing the last segment
        const cs = currentSegment as TranscriptionSegment;
        cs.text = cleanChineseText(cs.text);
        segments.push(cs);
      }
    }

    return segments;
  }





  /**
   * Estimate cost per minute for Deepgram Nova-2
   * Nova-2 is more cost-effective than Nova-3
   */
  estimateCost(durationInSeconds: number): number {
    const minutes = durationInSeconds / 60;
    // Nova-2 pricing: approximately $0.0036/minute (vs Nova-3 at $0.0043/minute)
    return Math.ceil(minutes) * 0.0036;
  }
}
