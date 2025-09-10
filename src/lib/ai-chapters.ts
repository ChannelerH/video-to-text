/**
 * AI Chapter Generation Service
 * Available for Pro/Premium tiers only
 * Uses DeepSeek API for intelligent chapter generation
 */

import { TranscriptionSegment } from './replicate';
import { BasicChapter, BasicSegmentationService } from './basic-segmentation';

export interface AIChapter extends BasicChapter {
  summary?: string;
  keywords?: string[];
  confidence: number;
}

export interface DeepSeekResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class AIChapterService {
  private static readonly DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
  private static readonly DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  /**
   * Generate AI-enhanced chapters using DeepSeek
   */
  static async generateAIChapters(
    segments: TranscriptionSegment[],
    options?: {
      language?: 'en' | 'zh';
      generateSummary?: boolean;
    }
  ): Promise<AIChapter[]> {
    // First, get basic chapters using algorithmic segmentation
    const basicChapters = BasicSegmentationService.generateBasicChapters(segments);
    
    // If no API key, return basic chapters
    if (!this.DEEPSEEK_API_KEY) {
      console.warn('DeepSeek API key not configured, returning basic chapters');
      return basicChapters.map(ch => ({
        ...ch,
        confidence: 0
      }));
    }

    // Enhance each chapter with AI-generated titles and summaries
    const aiChapters: AIChapter[] = [];
    
    // Process in batches to optimize API usage
    const batchSize = 5;
    for (let i = 0; i < basicChapters.length; i += batchSize) {
      const batch = basicChapters.slice(i, i + batchSize);
      const enhancedBatch = await this.enhanceBatchWithAI(batch, options);
      aiChapters.push(...enhancedBatch);
    }

    return aiChapters;
  }

  /**
   * Enhance a batch of chapters with AI
   */
  private static async enhanceBatchWithAI(
    chapters: BasicChapter[],
    options?: {
      language?: 'en' | 'zh';
      generateSummary?: boolean;
    }
  ): Promise<AIChapter[]> {
    const isChinese = /[\u4e00-\u9fff]/.test(chapters[0]?.segments[0]?.text || '');
    const language = options?.language || (isChinese ? 'zh' : 'en');
    
    try {
      const prompt = this.buildBatchPrompt(chapters, language, options?.generateSummary);
      const response = await this.callDeepSeekAPI(prompt, language);
      
      if (!response) {
        // Fallback to basic chapters if API fails
        return chapters.map(ch => ({
          ...ch,
          confidence: 0
        }));
      }

      // Parse AI response and merge with basic chapters
      const aiResults = this.parseAIResponse(response);
      
      return chapters.map((chapter, index) => {
        const aiResult = aiResults[index] || {};
        return {
          ...chapter,
          title: aiResult.title || chapter.title,
          summary: aiResult.summary,
          keywords: aiResult.keywords,
          confidence: aiResult.confidence || 0.8
        };
      });
    } catch (error) {
      console.error('Error enhancing chapters with AI:', error);
      // Return basic chapters on error
      return chapters.map(ch => ({
        ...ch,
        confidence: 0
      }));
    }
  }

  /**
   * Build prompt for batch processing
   */
  private static buildBatchPrompt(
    chapters: BasicChapter[],
    language: 'en' | 'zh',
    generateSummary?: boolean
  ): string {
    const chapterTexts = chapters.map((ch, i) => {
      const text = ch.segments.map(s => s.text).join(' ');
      // Limit text length to reduce tokens
      const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;
      return `Chapter ${i + 1} (${BasicSegmentationService.formatTime(ch.startTime)} - ${BasicSegmentationService.formatTime(ch.endTime)}):\n${truncatedText}`;
    }).join('\n\n');

    if (language === 'zh') {
      return `请为以下${chapters.length}个章节生成标题${generateSummary ? '和摘要' : ''}。

要求：
1. 标题简洁明了，5-15个字
2. 标题要概括章节主要内容
${generateSummary ? '3. 摘要控制在50字以内，概括核心要点' : ''}
4. 返回JSON格式

章节内容：
${chapterTexts}

请返回JSON格式：
[
  {
    "title": "章节标题",
    ${generateSummary ? '"summary": "章节摘要",' : ''}
    "keywords": ["关键词1", "关键词2"],
    "confidence": 0.9
  }
]`;
    } else {
      return `Generate titles${generateSummary ? ' and summaries' : ''} for the following ${chapters.length} chapters.

Requirements:
1. Titles should be concise, 3-10 words
2. Titles should summarize the main content
${generateSummary ? '3. Summaries should be under 50 words, highlighting key points' : ''}
4. Return in JSON format

Chapter content:
${chapterTexts}

Return JSON format:
[
  {
    "title": "Chapter Title",
    ${generateSummary ? '"summary": "Chapter summary",' : ''}
    "keywords": ["keyword1", "keyword2"],
    "confidence": 0.9
  }
]`;
    }
  }

  /**
   * Call DeepSeek API
   */
  private static async callDeepSeekAPI(prompt: string, language: 'en' | 'zh'): Promise<string | null> {
    try {
      console.log('Calling DeepSeek API with key:', this.DEEPSEEK_API_KEY ? 'Present' : 'Missing');
      const response = await fetch(this.DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: language === 'zh' 
                ? '你是一个专业的内容编辑，擅长为视频和音频内容生成章节标题和摘要。请用中文回复。'
                : 'You are a professional content editor, skilled at generating chapter titles and summaries for video and audio content.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent results
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('DeepSeek API error:', response.status, response.statusText, errorText);
        return null;
      }

      const data: DeepSeekResponse = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (error) {
      console.error('Error calling DeepSeek API:', error);
      return null;
    }
  }

  /**
   * Parse AI response
   */
  private static parseAIResponse(response: string): Array<{
    title?: string;
    summary?: string;
    keywords?: string[];
    confidence?: number;
  }> {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('Could not find JSON in AI response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        console.warn('AI response is not an array');
        return [];
      }

      return parsed;
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return [];
    }
  }

  /**
   * Generate AI summary for entire transcription
   */
  /**
   * Generate a basic summary without AI
   */
  private static generateBasicSummary(
    segments: TranscriptionSegment[],
    options?: {
      language?: 'en' | 'zh';
      maxLength?: number;
    }
  ): string {
    const text = segments.map(s => s.text).join(' ');
    const isChinese = /[\u4e00-\u9fff]/.test(text);
    const maxLength = options?.maxLength || 200;
    
    // Get the first few sentences that fit within maxLength
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    let summary = '';
    
    for (const sentence of sentences) {
      if ((summary + sentence).split(' ').length <= maxLength) {
        summary += sentence + ' ';
      } else {
        break;
      }
    }
    
    // If summary is still empty, just take the first part of the text
    if (!summary) {
      const words = text.split(' ');
      summary = words.slice(0, Math.min(words.length, maxLength)).join(' ');
      if (words.length > maxLength) {
        summary += '...';
      }
    }
    
    // Add a note that this is a basic summary
    const prefix = isChinese ? '【基础摘要】' : '[Basic Summary]';
    return `${prefix} ${summary.trim()}`;
  }

  static async generateSummary(
    segments: TranscriptionSegment[],
    options?: {
      language?: 'en' | 'zh';
      maxLength?: number;
    }
  ): Promise<string | null> {
    if (!this.DEEPSEEK_API_KEY) {
      console.warn('DeepSeek API key not configured, generating basic summary');
      // Generate a basic algorithmic summary
      return this.generateBasicSummary(segments, options);
    }

    const text = segments.map(s => s.text).join(' ');
    const truncatedText = text.length > 3000 ? text.substring(0, 3000) + '...' : text;
    const language = options?.language || (/[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en');
    const maxLength = options?.maxLength || 200;

    const prompt = language === 'zh'
      ? `请为以下内容生成一个${maxLength}字以内的摘要，概括主要观点和关键信息：\n\n${truncatedText}`
      : `Generate a summary under ${maxLength} words that captures the main points and key information:\n\n${truncatedText}`;

    try {
      const response = await this.callDeepSeekAPI(prompt, language);
      return response;
    } catch (error) {
      console.error('Error generating summary:', error);
      return null;
    }
  }
}