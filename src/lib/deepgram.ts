import { TranscriptionResult, TranscriptionSegment } from './replicate';

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
        diarize: 'false', // Can be enabled if needed
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

      // For preview mode, limit to 90 seconds unless probeSeconds specified
      if (options.probeSeconds && options.probeSeconds > 0) {
        params.set('start', '0');
        params.set('end', String(Math.max(1, Math.min(120, Math.floor(options.probeSeconds)))));
      } else if (options.isPreview) {
        params.set('start', '0');
        params.set('end', '90');
      }

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
      
      // Parse response
      const channel = result.results.channels[0];
      const alternative = channel.alternatives[0];
      
      if (!alternative || !alternative.transcript) {
        throw new Error('No transcription content from Deepgram');
      }
      
      // 处理中文转录结果中的空格问题
      let transcriptText = alternative.transcript;
      
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
      
      // Convert to segments
      const segments = this.convertToSegments(alternative);
      
      // Detect primary language
      let detectedLanguage = channel.detected_language || 
                            alternative.languages?.[0] || 
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
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
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
      }
      return text;
    };

    // Use paragraphs if available
    if (alternative.paragraphs?.paragraphs) {
      alternative.paragraphs.paragraphs.forEach((paragraph: any, pIndex: number) => {
        paragraph.sentences.forEach((sentence: any, sIndex: number) => {
          segments.push({
            id: pIndex * 100 + sIndex,
            seek: 0,
            start: sentence.start,
            end: sentence.end,
            text: cleanChineseText(sentence.text),
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
