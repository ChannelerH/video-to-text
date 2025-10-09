import {
  localPunctuateSegmentsIfChinese,
  rebuildTextFromSegments
} from './refine-local';
import { fixLatinNoise, fixLatinNoiseInSegments } from './lexicon-fix';
import { punctuateSegmentsLLM, punctuateTextLLM } from './punctuate-llm';
import { alignSentencesWithAnchors } from './sentence-align';

/**
 * 统一的中文润色处理函数
 * 可以被同步和异步路径复用
 */
export async function applyChineseRefinement(
  text: string,
  segments: any[],
  language: string,
  options?: {
    anchors?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ start: number; end: number; text: string }>;
    duration?: number;
  }
): Promise<{ text: string; segments: any[] }> {
  // 保存原始时间戳信息用于后续对齐
  const originalAnchors = options?.anchors || segments.map((s: any) => ({
    start: s.start || 0,
    end: s.end || 0,
    text: s.text || ''
  }));

  // Step 1: Apply local punctuation refinement to segments
  const changed = localPunctuateSegmentsIfChinese(segments, language);
  if (changed) console.log(`[Chinese Refinement] Segments normalized: ${changed} segments changed`);

  // Step 2: Optional LLM refinement for segments
  if (process.env.PUNCTUATE_LLM_SEGMENTS_ENABLED === 'true') {
    try {
      const segmentsRefined = await punctuateSegmentsLLM(segments, { language: 'zh' });
      if (segmentsRefined) {
        console.log('[Chinese Refinement] LLM segments refinement applied');
      }
    } catch (e) {
      console.warn('[Chinese Refinement] LLM segments refinement failed:', e);
    }
  }

  // Step 3: Rebuild text from refined segments
  let refinedText = rebuildTextFromSegments(segments);

  // Step 4: Optional full text LLM refinement
  if (!process.env.PUNCTUATE_LLM_SEGMENTS_ENABLED || process.env.PUNCTUATE_LLM_SEGMENTS_ENABLED !== 'true') {
    try {
      const llmText = await punctuateTextLLM(refinedText, { language: 'zh' });
      if (llmText) {
        console.log('[Chinese Refinement] LLM text refinement applied');
        refinedText = llmText;
      }
    } catch (e) {
      console.warn('[Chinese Refinement] LLM text refinement failed:', e);
    }
  }

  // Step 5: Fix Latin noise in segments and text
  fixLatinNoiseInSegments(segments);
  const finalText = fixLatinNoise(refinedText);

  // Step 6: 重新对齐时间戳 - 使用原始时间戳信息将润色后的文本对齐
  // 这一步很关键,因为LLM润色可能会改变文本结构,导致时间戳错位
  if (originalAnchors && originalAnchors.length > 0) {
    console.log(`[Chinese Refinement] Starting timestamp realignment:`, {
      anchors: originalAnchors.length,
      words: options?.words?.length || 0,
      textLength: finalText.length
    });

    try {
      const alignedSegments = alignSentencesWithAnchors(
        finalText,
        originalAnchors,
        language,
        { wordUnits: options?.words }
      );

      console.log(`[Chinese Refinement] ✅ Timestamp realignment complete: ${segments.length} -> ${alignedSegments.length} segments`);

      return { text: finalText, segments: alignedSegments };
    } catch (e) {
      console.warn('[Chinese Refinement] ❌ Timestamp alignment failed, using original segments:', e);
    }
  } else {
    console.warn('[Chinese Refinement] ⚠️ No anchors available, skipping realignment');
  }

  return { text: finalText, segments };
}