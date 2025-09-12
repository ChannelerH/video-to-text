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
      language?: string;
      generateSummary?: boolean;
    }
  ): Promise<AIChapter[]> {
    console.log('[AIChapters] Starting generation with', segments.length, 'segments');
    
    // If no API key, fall back to basic segmentation
    if (!this.DEEPSEEK_API_KEY) {
      console.warn('DeepSeek API key not configured, using basic chapters');
      const basicChapters = BasicSegmentationService.generateBasicChapters(segments);
      console.log('[AIChapters] Basic chapters generated:', basicChapters.length);
      return basicChapters.map(ch => ({
        ...ch,
        title: this.generateSmartTitle(ch.segments),
        confidence: 0.5
      }));
    }

    // Let AI analyze the entire content and decide chapter breaks
    try {
      console.log('[AIChapters] Calling AI generation...');
      const aiChapters = await this.generateChaptersWithAI(segments, options);
      console.log('[AIChapters] AI returned', aiChapters?.length || 0, 'chapters');
      
      if (aiChapters && aiChapters.length > 0) {
        return aiChapters;
      }
      console.warn('[AIChapters] AI returned no chapters, falling back to basic');
    } catch (error) {
      console.error('[AIChapters] AI chapter generation failed:', error);
    }

    // Fallback to basic chapters if AI fails
    const basicChapters = BasicSegmentationService.generateBasicChapters(segments);
    console.log('[AIChapters] Fallback basic chapters:', basicChapters.length);
    return basicChapters.map(ch => ({
      ...ch,
      title: this.generateSmartTitle(ch.segments),
      confidence: 0.5
    }));
  }
  
  /**
   * Generate chapters using AI to analyze full content
   */
  private static async generateChaptersWithAI(
    segments: TranscriptionSegment[],
    options?: {
      language?: string;
      generateSummary?: boolean;
    }
  ): Promise<AIChapter[]> {
    const detectedLanguage = this.detectLanguage(segments[0]?.text || '');
    const language = options?.language || detectedLanguage;
    console.log('[AIChapters] Detected language:', language);
    
    // Prepare content for AI analysis
    const fullText = segments.map((s, i) => 
      `[${this.formatTime(s.start)}] ${s.text}`
    ).join('\n');
    
    console.log('[AIChapters] Full text length:', fullText.length);
    
    // Limit content length to avoid token limits
    // Increased from 8000 to 15000 for better chapter detection
    const maxLength = 15000;
    const truncatedText = fullText.length > maxLength 
      ? fullText.substring(0, maxLength) + '...\n[Content truncated]'
      : fullText;
    
    console.log('[AIChapters] Sending text length:', truncatedText.length);
    
    // Build prompt for AI to analyze and segment
    const prompt = this.buildSegmentationPrompt(truncatedText, segments.length, language, options?.generateSummary);
    
    try {
      console.log('[AIChapters] Calling DeepSeek API...');
      const response = await this.callDeepSeekAPI(prompt, language);
      console.log('[AIChapters] AI Response:', response?.substring(0, 500));
      
      if (!response) {
        console.error('[AIChapters] No response from AI');
        return [];
      }
      
      // Parse AI response
      const chapters = this.parseChapterResponse(response, segments);
      console.log('[AIChapters] Parsed chapters:', chapters.length);
      return chapters;
    } catch (error) {
      console.error('[AIChapters] Error in AI chapter generation:', error);
      return [];
    }
  }

  /**
   * Build prompt for content segmentation
   */
  private static buildSegmentationPrompt(
    content: string,
    segmentCount: number,
    language: string,
    generateSummary?: boolean
  ): string {
    // Get language name for the prompt
    const languageNames: Record<string, string> = {
      zh: 'Chinese',
      en: 'English',
      ja: 'Japanese',
      ko: 'Korean',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ar: 'Arabic',
      hi: 'Hindi',
      th: 'Thai',
      vi: 'Vietnamese',
      id: 'Indonesian',
      tr: 'Turkish',
      pl: 'Polish',
      nl: 'Dutch',
      sv: 'Swedish',
      no: 'Norwegian'
    };
    
    const languageName = languageNames[language] || language;
    
    // Universal prompt that works for all languages
    const prompt = `Analyze the following transcription in ${languageName} and intelligently segment it into chapters based on topic changes.

Requirements:
1. Identify natural topic transitions, theme changes, or discussion points
2. Each chapter should contain a complete topic or discussion
3. Create AT LEAST 3 chapters and up to 15 chapters based on content
4. IMPORTANT: Do NOT create just one chapter - analyze the content carefully for topic changes
5. Generate specific, informative titles in ${languageName}
6. Titles should capture the main point of each chapter
${generateSummary ? `7. Generate summaries for each chapter in ${languageName}` : ''}
8. ALL output text (titles${generateSummary ? ', summaries' : ''}) MUST be in ${languageName}

Content (format: [timestamp] text):
${content}

Return JSON format with start time, end time, and title for each chapter.
IMPORTANT: Create MULTIPLE chapters (at least 3), not just one!
The title${generateSummary ? ' and summary' : ''} must be in ${languageName}:
[
  {
    "startTime": "00:00",
    "endTime": "02:30", 
    "title": "First topic in ${languageName}",
    ${generateSummary ? `"summary": "Chapter summary in ${languageName}",` : ''}
    "confidence": 0.95
  },
  {
    "startTime": "02:30",
    "endTime": "05:00", 
    "title": "Second topic in ${languageName}",
    ${generateSummary ? `"summary": "Chapter summary in ${languageName}",` : ''}
    "confidence": 0.92
  },
  // ... more chapters
]`;
    
    return prompt;
  }

  /**
   * Parse AI response for chapters
   */
  private static parseChapterResponse(response: string, segments: TranscriptionSegment[]): AIChapter[] {
    try {
      console.log('[ParseChapters] Raw AI response:', response);
      
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[ParseChapters] No JSON found in AI response');
        console.error('[ParseChapters] Full response:', response);
        return [];
      }
      
      console.log('[ParseChapters] Extracted JSON:', jsonMatch[0]);
      
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        console.error('[ParseChapters] AI response is not an array');
        return [];
      }
      
      console.log('[ParseChapters] Parsed', parsed.length, 'items from AI');
      
      // Convert AI response to chapters with segments
      const chapters: AIChapter[] = [];
      
      for (const item of parsed) {
        const startTime = this.parseTime(item.startTime);
        const endTime = this.parseTime(item.endTime);
        
        // Find segments within this chapter's time range
        const chapterSegments = segments.filter(s => 
          s.start >= startTime && s.start < endTime
        );
        
        if (chapterSegments.length > 0) {
          chapters.push({
            id: `chapter-${chapters.length + 1}`,
            title: item.title || `Chapter ${chapters.length + 1}`,
            startTime,
            endTime,
            segments: chapterSegments,
            wordCount: chapterSegments.reduce((sum, s) => sum + s.text.split(' ').length, 0),
            summary: item.summary,
            confidence: item.confidence || 0.9
          });
        }
      }
      
      console.log('[ParseChapters] Created', chapters.length, 'chapters from AI response');
      
      // If we only got 1 chapter, try to split it automatically
      if (chapters.length === 1 && segments.length > 10) {
        console.warn('[ParseChapters] WARNING: Only 1 chapter was created from AI response');
        console.warn('[ParseChapters] Attempting to auto-split into multiple chapters');
        
        const totalDuration = chapters[0].endTime - chapters[0].startTime;
        const targetChapters = Math.min(5, Math.max(3, Math.floor(totalDuration / 120))); // 2-minute chapters
        const chapterDuration = totalDuration / targetChapters;
        
        const splitChapters: AIChapter[] = [];
        for (let i = 0; i < targetChapters; i++) {
          const startTime = chapters[0].startTime + (i * chapterDuration);
          const endTime = i === targetChapters - 1 ? chapters[0].endTime : startTime + chapterDuration;
          
          const chapterSegments = segments.filter(s => 
            s.start >= startTime && s.start < endTime
          );
          
          if (chapterSegments.length > 0) {
            splitChapters.push({
              id: `chapter-${i + 1}`,
              title: `${chapters[0].title} - Part ${i + 1}`,
              startTime,
              endTime,
              segments: chapterSegments,
              wordCount: chapterSegments.reduce((sum, s) => sum + s.text.split(' ').length, 0),
              summary: chapters[0].summary,
              confidence: 0.7
            });
          }
        }
        
        if (splitChapters.length > 1) {
          console.log('[ParseChapters] Auto-split into', splitChapters.length, 'chapters');
          return splitChapters;
        }
      }
      
      return chapters;
    } catch (error) {
      console.error('Error parsing chapter response:', error);
      return [];
    }
  }

  /**
   * Parse time string to seconds
   */
  private static parseTime(timeStr: string): number {
    if (typeof timeStr === 'number') return timeStr;
    
    const parts = timeStr.split(':').map(p => parseFloat(p));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * Format time in seconds to string
   */
  private static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Detect language from text content
   */
  private static detectLanguage(text: string): string {
    // Chinese
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    
    // Japanese (Hiragana, Katakana)
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    
    // Korean
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return 'ko';
    
    // Arabic
    if (/[\u0600-\u06ff\u0750-\u077f]/.test(text)) return 'ar';
    
    // Hebrew
    if (/[\u0590-\u05ff]/.test(text)) return 'he';
    
    // Thai
    if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
    
    // Hindi/Devanagari
    if (/[\u0900-\u097f]/.test(text)) return 'hi';
    
    // Russian/Cyrillic
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    
    // Greek
    if (/[\u0370-\u03ff]/.test(text)) return 'el';
    
    // Vietnamese (has special tone marks)
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) return 'vi';
    
    // Turkish (special characters)
    if (/[ğĞıİöÖşŞüÜçÇ]/.test(text) && /\b(ve|bir|bu|da|de|için|ile)\b/i.test(text)) return 'tr';
    
    // Polish (special characters)
    if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'pl';
    
    // Dutch
    if (/\b(de|het|een|van|en|in|op|met|voor|aan|te|dat|is)\b/i.test(text)) return 'nl';
    
    // Swedish/Norwegian (similar patterns)
    if (/[åäöÅÄÖæøÆØ]/.test(text) && /\b(och|att|det|som|på|av|för|med)\b/i.test(text)) return 'sv';
    
    // Spanish (check for common Spanish words/patterns)
    if (/\b(el|la|los|las|un|una|de|que|es|en|por|para|con|su)\b/i.test(text)) return 'es';
    
    // French (check for common French words/patterns)
    if (/\b(le|la|les|un|une|de|que|est|dans|pour|avec|sur)\b/i.test(text)) return 'fr';
    
    // German (check for common German words/patterns)
    if (/\b(der|die|das|ein|eine|und|ist|von|mit|für|auf)\b/i.test(text)) return 'de';
    
    // Portuguese
    if (/\b(o|a|os|as|um|uma|de|que|é|em|para|com|do|da)\b/i.test(text)) return 'pt';
    
    // Italian
    if (/\b(il|la|gli|le|un|una|di|che|è|in|per|con|del)\b/i.test(text)) return 'it';
    
    // Indonesian/Malay
    if (/\b(dan|yang|di|ke|dari|untuk|dengan|ini|itu|pada)\b/i.test(text)) return 'id';
    
    // Default to English
    return 'en';
  }

  /**
   * Generate a smart title from segments without AI
   */
  private static generateSmartTitle(segments: TranscriptionSegment[]): string {
    if (!segments || segments.length === 0) return 'Untitled Section';
    
    const fullText = segments.map(s => s.text).join(' ').trim();
    const isChinese = /[\u4e00-\u9fff]/.test(fullText);
    
    // Extract key phrases and topics
    const sentences = fullText.match(/[^.!?。！？]+[.!?。！？]*/g) || [fullText];
    const firstSentence = sentences[0]?.trim() || fullText;
    
    // Smart truncation for title
    if (firstSentence.length <= 50) {
      return firstSentence.replace(/[.!?。！？]+$/, '');
    }
    
    // Find natural break points
    const words = isChinese ? firstSentence.split('') : firstSentence.split(/\s+/);
    const titleLength = isChinese ? 15 : 8;
    const title = words.slice(0, titleLength).join(isChinese ? '' : ' ');
    
    return title + (words.length > titleLength ? '...' : '');
  }

  /**
   * Enhance a batch of chapters with AI
   */
  private static async enhanceBatchWithAI(
    chapters: BasicChapter[],
    options?: {
      language?: string;
      generateSummary?: boolean;
    }
  ): Promise<AIChapter[]> {
    // Detect language from content or use provided language
    const detectedLanguage = this.detectLanguage(chapters[0]?.segments[0]?.text || '');
    const language = options?.language || detectedLanguage;
    
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
    language: string,
    generateSummary?: boolean
  ): string {
    const chapterTexts = chapters.map((ch, i) => {
      const text = ch.segments.map(s => s.text).join(' ');
      // Limit text length to reduce tokens
      const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;
      return `Chapter ${i + 1} (${BasicSegmentationService.formatTime(ch.startTime)} - ${BasicSegmentationService.formatTime(ch.endTime)}):\n${truncatedText}`;
    }).join('\n\n');

    // Build language-specific prompts
    const languagePrompts: Record<string, string> = {
      zh: `你是一个专业的内容编辑助手。请为以下${chapters.length}个章节生成精准、吸引人的标题${generateSummary ? '和摘要' : ''}。

要求：
1. 标题要精准概括该章节的核心主题，8-20个字
2. 标题要具体且有信息量，避免泛泛而谈
3. 使用动词开头或关键概念开头，让标题更有力量
4. 如果是教程或说明类内容，标题要体现具体步骤或方法
${generateSummary ? '5. 摘要控制在50-80字，提炼关键信息和要点' : ''}
6. 返回标准JSON格式，确保可以被解析

章节内容：
${chapterTexts}

请严格按照以下JSON格式返回（不要添加任何额外文字）：
[
  {
    "title": "具体且信息丰富的标题",
    ${generateSummary ? '"summary": "章节核心内容摘要",' : ''}
    "keywords": ["核心关键词1", "核心关键词2"],
    "confidence": 0.95
  }
]`,
      
      ja: `あなたはプロフェッショナルなコンテンツエディターです。以下の${chapters.length}つのチャプターに対して、正確で魅力的なタイトル${generateSummary ? 'と要約' : ''}を生成してください。

要件：
1. タイトルは具体的で情報量があり、10-30文字
2. 各章の核心的なトピックや要点を捉える
3. アクションや重要な概念から始める
${generateSummary ? '4. 要約は50-100文字で主要な情報を抽出' : ''}
5. 有効なJSON形式で返す

章の内容：
${chapterTexts}

以下のJSON形式で返してください：
[
  {
    "title": "具体的で情報豊富なタイトル",
    ${generateSummary ? '"summary": "章の要約",' : ''}
    "keywords": ["キーワード1", "キーワード2"],
    "confidence": 0.95
  }
]`,
      
      ko: `당신은 전문 콘텐츠 편집자입니다. 다음 ${chapters.length}개 챕터에 대해 정확하고 매력적인 제목${generateSummary ? '과 요약' : ''}을 생성해주세요.

요구사항:
1. 제목은 구체적이고 정보가 풍부하며, 10-30자
2. 각 챕터의 핵심 주제나 요점을 포착
3. 동작이나 핵심 개념으로 시작
${generateSummary ? '4. 요약은 50-100자로 주요 정보 추출' : ''}
5. 유효한 JSON 형식으로 반환

챕터 내용:
${chapterTexts}

다음 JSON 형식으로 반환해주세요:
[
  {
    "title": "구체적이고 정보가 풍부한 제목",
    ${generateSummary ? '"summary": "챕터 요약",' : ''}
    "keywords": ["키워드1", "키워드2"],
    "confidence": 0.95
  }
]`,
      
      es: `Eres un editor de contenido profesional. Genera títulos${generateSummary ? ' y resúmenes' : ''} precisos y atractivos para los siguientes ${chapters.length} capítulos.

Requisitos:
1. Los títulos deben ser específicos e informativos, 5-15 palabras
2. Capturar el tema central o punto principal de cada capítulo
3. Usar verbos de acción o conceptos clave
${generateSummary ? '4. Los resúmenes deben tener 30-60 palabras, extrayendo información clave' : ''}
5. Devolver en formato JSON válido

Contenido del capítulo:
${chapterTexts}

Devuelve estrictamente en este formato JSON:
[
  {
    "title": "Título específico e informativo",
    ${generateSummary ? '"summary": "Resumen del contenido del capítulo",' : ''}
    "keywords": ["palabra_clave1", "palabra_clave2"],
    "confidence": 0.95
  }
]`,
      
      fr: `Vous êtes un éditeur de contenu professionnel. Générez des titres${generateSummary ? ' et des résumés' : ''} précis et engageants pour les ${chapters.length} chapitres suivants.

Exigences:
1. Les titres doivent être spécifiques et informatifs, 5-15 mots
2. Capturer le sujet principal ou le point clé de chaque chapitre
3. Utiliser des verbes d'action ou des concepts clés
${generateSummary ? '4. Les résumés doivent contenir 30-60 mots, en extrayant les informations clés' : ''}
5. Retourner au format JSON valide

Contenu du chapitre:
${chapterTexts}

Retournez strictement dans ce format JSON:
[
  {
    "title": "Titre spécifique et informatif",
    ${generateSummary ? '"summary": "Résumé du contenu du chapitre",' : ''}
    "keywords": ["mot_clé1", "mot_clé2"],
    "confidence": 0.95
  }
]`,
      
      de: `Sie sind ein professioneller Content-Editor. Generieren Sie präzise und ansprechende Titel${generateSummary ? ' und Zusammenfassungen' : ''} für die folgenden ${chapters.length} Kapitel.

Anforderungen:
1. Titel sollten spezifisch und informativ sein, 5-15 Wörter
2. Das Kernthema oder den Hauptpunkt jedes Kapitels erfassen
3. Aktionsverben oder Schlüsselkonzepte verwenden
${generateSummary ? '4. Zusammenfassungen sollten 30-60 Wörter umfassen und Schlüsselinformationen extrahieren' : ''}
5. In gültigem JSON-Format zurückgeben

Kapitelinhalt:
${chapterTexts}

Strikt in diesem JSON-Format zurückgeben:
[
  {
    "title": "Spezifischer und informativer Titel",
    ${generateSummary ? '"summary": "Zusammenfassung des Kapitelinhalts",' : ''}
    "keywords": ["Schlüsselwort1", "Schlüsselwort2"],
    "confidence": 0.95
  }
]`,
      
      ru: `Вы профессиональный редактор контента. Создайте точные и привлекательные заголовки${generateSummary ? ' и резюме' : ''} для следующих ${chapters.length} глав.

Требования:
1. Заголовки должны быть конкретными и информативными, 5-15 слов
2. Отражать основную тему или главную мысль каждой главы
3. Использовать глаголы действия или ключевые концепции
${generateSummary ? '4. Резюме должны содержать 30-60 слов, извлекая ключевую информацию' : ''}
5. Вернуть в правильном формате JSON

Содержание главы:
${chapterTexts}

Строго верните в этом формате JSON:
[
  {
    "title": "Конкретный и информативный заголовок",
    ${generateSummary ? '"summary": "Резюме содержания главы",' : ''}
    "keywords": ["ключевое_слово1", "ключевое_слово2"],
    "confidence": 0.95
  }
]`,
      
      ar: `أنت محرر محتوى محترف. قم بإنشاء عناوين${generateSummary ? ' وملخصات' : ''} دقيقة وجذابة للفصول الـ ${chapters.length} التالية.

المتطلبات:
1. يجب أن تكون العناوين محددة وغنية بالمعلومات، 5-15 كلمة
2. التقاط الموضوع الأساسي أو النقطة الرئيسية لكل فصل
3. استخدام أفعال الحركة أو المفاهيم الرئيسية
${generateSummary ? '4. يجب أن تكون الملخصات 30-60 كلمة، واستخراج المعلومات الرئيسية' : ''}
5. الإرجاع بتنسيق JSON صالح

محتوى الفصل:
${chapterTexts}

أرجع بدقة بهذا التنسيق JSON:
[
  {
    "title": "عنوان محدد وغني بالمعلومات",
    ${generateSummary ? '"summary": "ملخص محتوى الفصل",' : ''}
    "keywords": ["كلمة_مفتاحية1", "كلمة_مفتاحية2"],
    "confidence": 0.95
  }
]`
    };

    // Default English prompt for any unspecified language
    const defaultPrompt = `You are a professional content editor. Generate accurate and engaging titles${generateSummary ? ' and summaries' : ''} for the following ${chapters.length} chapters in ${language} language.

Requirements:
1. Titles should be specific and informative, appropriate length for the language
2. Titles should capture the core topic or main point of each chapter
3. Use action verbs or key concepts to make titles more compelling
4. For tutorials or instructional content, reflect specific steps or methods
${generateSummary ? '5. Summaries should extract key information and main points' : ''}
6. Return valid JSON format that can be parsed
7. Generate content in ${language} language

Chapter content:
${chapterTexts}

Return strictly in this JSON format (no additional text):
[
  {
    "title": "Specific and informative title in ${language}",
    ${generateSummary ? '"summary": "Chapter core content summary in ' + language + '",' : ''}
    "keywords": ["keyword1", "keyword2"],
    "confidence": 0.95
  }
]`;

    return languagePrompts[language] || defaultPrompt;
  }

  /**
   * Call DeepSeek API
   */
  private static async callDeepSeekAPI(prompt: string, language: string): Promise<string | null> {
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