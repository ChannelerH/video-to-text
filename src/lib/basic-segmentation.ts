/**
 * Basic Segmentation Service
 * Available for Basic tier and above
 * Uses algorithmic detection without AI
 */

import { TranscriptionSegment } from './replicate';

export interface BasicChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  segments: TranscriptionSegment[];
  wordCount: number;
}

export class BasicSegmentationService {
  private static readonly MIN_CHAPTER_DURATION = 30; // Reduced to 30 seconds for more chapters
  private static readonly MAX_CHAPTER_DURATION = 90; // Reduced to 1.5 minutes for more chapters
  private static readonly SILENCE_THRESHOLD = 0.5; // Reduced to 0.5 seconds for more sensitive detection
  
  /**
   * Generate basic chapters from segments using algorithmic detection
   */
  static generateBasicChapters(segments: TranscriptionSegment[]): BasicChapter[] {
    if (!segments || segments.length === 0) {
      return [];
    }

    const chapters: BasicChapter[] = [];
    let currentChapter: TranscriptionSegment[] = [];
    let chapterStartTime = segments[0]?.start || 0;
    let chapterDuration = 0;
    let chapterWordCount = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const previousSegment = segments[i - 1];
      
      // Check if we should start a new chapter
      const shouldSplit = this.shouldCreateNewChapter(
        segment,
        previousSegment,
        chapterDuration,
        currentChapter.length
      );

      if (shouldSplit && currentChapter.length > 0) {
        // Save current chapter
        chapters.push({
          id: `chapter-${chapters.length + 1}`,
          title: this.generateBasicTitle(currentChapter, chapters.length + 1),
          startTime: chapterStartTime,
          endTime: previousSegment?.end || chapterStartTime,
          segments: [...currentChapter],
          wordCount: chapterWordCount
        });

        // Start new chapter
        currentChapter = [];
        chapterStartTime = segment.start;
        chapterDuration = 0;
        chapterWordCount = 0;
      }

      // Add segment to current chapter
      currentChapter.push(segment);
      chapterDuration = segment.end - chapterStartTime;
      chapterWordCount += this.countWords(segment.text);
    }

    // Save the last chapter
    if (currentChapter.length > 0) {
      const lastSegment = segments[segments.length - 1];
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        title: this.generateBasicTitle(currentChapter, chapters.length + 1),
        startTime: chapterStartTime,
        endTime: lastSegment?.end || chapterStartTime,
        segments: currentChapter,
        wordCount: chapterWordCount
      });
    }

    return chapters;
  }

  /**
   * Determine if a new chapter should be created
   */
  private static shouldCreateNewChapter(
    current: TranscriptionSegment,
    previous: TranscriptionSegment | undefined,
    currentDuration: number,
    segmentCount: number
  ): boolean {
    // No previous segment means we're at the start
    if (!previous) {
      return false;
    }

    // Check for silence gap
    const silenceGap = current.start - previous.end;
    if (silenceGap > this.SILENCE_THRESHOLD) {
      return true;
    }

    // Check if chapter is too long
    if (currentDuration > this.MAX_CHAPTER_DURATION) {
      return true;
    }

    // Check for speaker change (if speaker info exists)
    if (current.speaker && previous.speaker && current.speaker !== previous.speaker) {
      // Only split on speaker change if we have enough content
      if (currentDuration > this.MIN_CHAPTER_DURATION) {
        return true;
      }
    }

    // Check for significant pause in speech (punctuation-based heuristic)
    const previousText = previous.text?.trim() || '';
    const endsWithFullStop = /[.!?。！？]$/.test(previousText);
    if (endsWithFullStop && currentDuration > this.MIN_CHAPTER_DURATION) {
      // Check if there's also a topic shift (simple keyword comparison)
      const previousKeywords = this.extractKeywords(previous.text);
      const currentKeywords = this.extractKeywords(current.text);
      const overlap = this.calculateKeywordOverlap(previousKeywords, currentKeywords);
      
      if (overlap < 0.3) { // Less than 30% keyword overlap suggests topic change
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a basic title from chapter content
   */
  private static generateBasicTitle(segments: TranscriptionSegment[], chapterNumber: number): string {
    const allText = segments.map(s => s.text).join(' ').trim();
    
    // Check if content is in Chinese
    const isChinese = /[\u4e00-\u9fff]/.test(allText);
    
    // Extract key topic and action from the text
    const topic = this.extractTopic(allText, isChinese);
    const action = this.extractAction(allText, isChinese);
    
    // Generate descriptive title in format: "Topic | Action"
    if (topic && action) {
      return isChinese ? `${topic}｜${action}` : `${topic} | ${action}`;
    } else if (topic) {
      return topic;
    }
    
    // Fallback: Use first meaningful phrase
    const firstSentence = allText.match(/^[^.!?。！？]+/)?.[0]?.trim() || '';
    if (firstSentence && firstSentence.length <= 30) {
      return firstSentence;
    } else if (firstSentence) {
      const words = firstSentence.split(/\s+/);
      return words.slice(0, 4).join(' ') + '...';
    }

    // Last fallback
    return isChinese ? `第${chapterNumber}段` : `Section ${chapterNumber}`;
  }

  /**
   * Extract the main topic from text
   */
  private static extractTopic(text: string, isChinese: boolean): string {
    // Look for location, person, or main subject
    const keywords = this.extractKeywords(text);
    
    // Common topic patterns
    if (isChinese) {
      const patterns = [
        /在(.{2,6})[，。]/,  // Location: 在...
        /关于(.{2,8})/,      // About: 关于...
        /(.{2,6})的问题/,    // Issue: ...的问题
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1];
      }
    } else {
      // Look for location or subject mentions
      const locationMatch = text.match(/(?:at|in|on)\s+(?:the\s+)?(\w+(?:\s+\w+)?)/i);
      if (locationMatch) return this.capitalizeWords(locationMatch[1]);
      
      // Look for main subject (first noun phrase)
      if (keywords.length > 0) {
        return this.capitalizeWords(keywords[0]);
      }
    }
    
    return '';
  }

  /**
   * Extract the main action or event from text
   */
  private static extractAction(text: string, isChinese: boolean): string {
    // Look for verbs and action phrases
    const sentences = text.match(/[^.!?。！？]+/g) || [];
    if (sentences.length === 0) return '';
    
    const firstSentence = sentences[0];
    
    if (isChinese) {
      // Chinese action patterns
      const patterns = [
        /(.{2,10}了)/,       // Past action: ...了
        /正在(.{2,10})/,     // Ongoing: 正在...
        /开始(.{2,10})/,     // Start: 开始...
        /(.{2,10})起来/,     // Begin to: ...起来
      ];
      for (const pattern of patterns) {
        const match = firstSentence.match(pattern);
        if (match) return match[1].replace(/[，。]/g, '');
      }
    } else {
      // Extract verb phrase
      const verbPatterns = [
        /(?:is|was|are|were)\s+(\w+ing)/i,  // Progressive
        /(?:has|have|had)\s+(\w+ed)/i,       // Perfect
        /(?:to|will|would|can|could|should)\s+(\w+)/i, // Modal + base
      ];
      
      for (const pattern of verbPatterns) {
        const match = firstSentence.match(pattern);
        if (match) return this.capitalizeWords(match[1]);
      }
      
      // Look for action words in keywords
      const actionWords = this.extractKeywords(firstSentence)
        .filter(word => !['the', 'a', 'an', 'this', 'that'].includes(word.toLowerCase()));
      
      if (actionWords.length > 1) {
        return this.capitalizeWords(actionWords.slice(0, 2).join(' '));
      }
    }
    
    return '';
  }

  /**
   * Extract keywords from text (simple frequency-based approach)
   */
  private static extractKeywords(text: string): string[] {
    if (!text) return [];

    // Common stop words to exclude
    const stopWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
      'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
      'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
      'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
      'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
      'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
      '的', '了', '是', '我', '你', '他', '她', '它', '们', '这', '那', '有', '在',
      '和', '与', '或', '但', '如果', '因为', '所以', '就', '都', '也', '还', '很',
      '被', '把', '给', '让', '向', '从', '到', '对', '为', '上', '下', '中'
    ]);

    // Tokenize and count words
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep alphanumeric and Chinese characters
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Sort by frequency and return top words
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Calculate keyword overlap between two sets
   */
  private static calculateKeywordOverlap(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0;
    }

    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    return intersection.size / Math.min(set1.size, set2.size);
  }

  /**
   * Count words in text
   */
  private static countWords(text: string): number {
    if (!text) return 0;
    
    // For Chinese text, count characters
    if (/[\u4e00-\u9fff]/.test(text)) {
      return text.replace(/[^\u4e00-\u9fff]/g, '').length;
    }
    
    // For English, count words
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  /**
   * Capitalize first letter of each word
   */
  private static capitalizeWords(text: string): string {
    return text.replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Format time in MM:SS format
   */
  static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}