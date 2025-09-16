import { 
  localPunctuateSegmentsIfChinese, 
  rebuildTextFromSegments
} from './refine-local';
import { fixLatinNoise, fixLatinNoiseInSegments } from './lexicon-fix';
import { punctuateSegmentsLLM, punctuateTextLLM } from './punctuate-llm';

/**
 * 统一的中文润色处理函数
 * 可以被同步和异步路径复用
 */
export async function applyChineseRefinement(
  text: string,
  segments: any[],
  language: string
): Promise<{ text: string; segments: any[] }> {
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
  
  return { text: finalText, segments };
}