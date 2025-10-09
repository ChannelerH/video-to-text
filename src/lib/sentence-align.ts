import { TranscriptionSegment } from './replicate';
import { isChineseLangOrText } from './refine-local';

// Split final, punctuated text into display sentences
export function splitIntoSentences(text: string, lang?: string): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  const isZh = isChineseLangOrText(lang, raw);
  if (isZh) {
    // Keep end punctuation and closing quotes/brackets with the sentence
    const re = /[^。！？；]+[。！？；]?[”’）】]?/g;
    const parts = raw.match(re) || [];
    return parts.map(s => s.trim()).filter(Boolean);
  }
  // English-like: split at . ! ? followed by space/EOS; keep punctuation
  return raw.split(/(?<=[.!?])\s+/g).map(s => s.trim()).filter(Boolean);
}

// Create sentence-level segments by merging original segments to sentence boundaries
export function alignSentencesWithSegments(
  finalText: string,
  originalSegments: TranscriptionSegment[],
  lang?: string
): TranscriptionSegment[] {
  const sentences = splitIntoSentences(finalText, lang);
  if (!sentences.length) return [];
  if (!originalSegments || originalSegments.length === 0) {
    // No timing info; return one dummy segment at 0..0 per sentence
    return sentences.map((t, i) => ({
      id: i,
      seek: 0,
      start: i === 0 ? 0 : originalSegments?.[0]?.start || 0,
      end: originalSegments?.[0]?.end || 0,
      text: t,
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    }));
  }

  const isZh = isChineseLangOrText(lang, finalText);
  const clean = (s: string) => (s || '').replace(isZh ? /\s+/g : /\s+/g, isZh ? '' : ' ').trim();
  const segTexts = originalSegments.map(s => clean(String(s.text || '')));

  const result: TranscriptionSegment[] = [];
  let segIdx = 0;
  let buffer = '';
  let sentId = 0;
  while (sentId < sentences.length && segIdx < originalSegments.length) {
    const target = clean(sentences[sentId]);
    if (!target) { sentId++; continue; }

    let startIdx = segIdx;
    buffer = '';
    while (segIdx < originalSegments.length && buffer.length < target.length) {
      buffer += segTexts[segIdx];
      segIdx++;
      // allow small overshoot due to punctuation normalization
      if (buffer.length >= target.length * 0.92) break;
    }

    const first = originalSegments[startIdx];
    const last = originalSegments[Math.max(startIdx, segIdx - 1)];
    if (!first || !last) break;

    // Determine majority speaker in merged window (if any)
    const windowSegs = originalSegments.slice(startIdx, Math.max(startIdx, segIdx));
    let speaker: string | undefined;
    try {
      const counts = new Map<string, number>();
      windowSegs.forEach((s: any) => {
        if (s && s.speaker != null) {
          const key = String(s.speaker);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      });
      let bestKey: string | undefined;
      let best = -1;
      counts.forEach((v, k) => { if (v > best) { best = v; bestKey = k; } });
      speaker = bestKey;
    } catch {}

    result.push({
      id: result.length,
      seek: 0,
      start: first.start,
      end: last.end,
      text: sentences[sentId],
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0,
      ...(speaker ? { speaker } as any : {})
    });
    sentId++;
  }

  // If there are remaining sentences but no segments left, append them with the last timestamp
  const tailEnd = originalSegments[originalSegments.length - 1]?.end ?? 0;
  while (sentId < sentences.length) {
    result.push({
      id: result.length,
      seek: 0,
      start: tailEnd,
      end: tailEnd,
      text: sentences[sentId++],
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    });
  }

  return result;
}

/**
 * 移除标点符号和空格，仅保留文字内容用于匹配
 */
function removePunctuation(text: string, isZh: boolean): string {
  if (isZh) {
    // 中文：移除所有标点和空格(包括中英文标点)
    return text.replace(/[，。！？；：、""''…—,\.!?;:"""''\-\s]/g, '');
  } else {
    // 英文：移除标点，保留空格
    return text.replace(/[,\.!?;:"""''\-—]/g, '');
  }
}

/**
 * 模糊匹配评分：检查从startIdx开始的words是否匹配sentence
 * 返回匹配度 0-1
 */
function fuzzyMatchScore(
  sentence: string,
  words: Array<{ text: string }>,
  startIdx: number,
  maxCheckLen: number = 20
): number {
  let matched = 0;
  const checkLen = Math.min(sentence.length, words.length - startIdx, maxCheckLen);

  if (checkLen === 0) return 0;

  for (let i = 0; i < checkLen; i++) {
    const wordText = words[startIdx + i]?.text || '';
    const sentChar = sentence[i];

    if (wordText === sentChar) {
      matched++;
    }
  }

  return matched / checkLen;
}

/**
 * 字级精确对齐：使用words数组的字级时间戳进行精确对齐
 */
function alignSentencesWithWordLevel(
  sentences: string[],
  words: Array<{ start: number; end: number; text: string }>,
  lang?: string
): TranscriptionSegment[] | null {
  const isZh = isChineseLangOrText(lang, sentences.join(''));
  const result: TranscriptionSegment[] = [];
  let wordIdx = 0; // 当前搜索起点

  console.log(`[Align] Word-level alignment: ${sentences.length} sentences, ${words.length} words`);

  for (let sentIdx = 0; sentIdx < sentences.length; sentIdx++) {
    const sentence = sentences[sentIdx];
    const cleanSentence = removePunctuation(sentence, isZh);

    if (!cleanSentence || cleanSentence.length === 0) {
      // 空句子，跳过
      continue;
    }

    const firstChar = cleanSentence[0];
    const lastChar = cleanSentence[cleanSentence.length - 1];

    let startIdx = -1;
    let endIdx = -1;

    // 查找首字
    for (let i = wordIdx; i < words.length; i++) {
      if (words[i].text === firstChar) {
        // 验证后续字符是否匹配
        const score = fuzzyMatchScore(cleanSentence, words, i);
        if (score > 0.5) { // 至少50%匹配
          startIdx = i;
          console.log(`[Align] Sentence ${sentIdx} start found at word ${i}, score=${score.toFixed(2)}, char="${firstChar}"`);
          break;
        }
      }
    }

    if (startIdx === -1) {
      console.warn(`[Align] Failed to find start for sentence ${sentIdx}: "${sentence.substring(0, 20)}..."`);
      return null; // 匹配失败，降级到比例分配
    }

    // 从startIdx向后查找尾字，找最接近句子长度的匹配
    let bestEndIdx = startIdx;
    let bestEndScore = -1;
    const targetLen = cleanSentence.length;

    for (let i = startIdx; i < Math.min(startIdx + cleanSentence.length * 2, words.length); i++) {
      if (words[i].text === lastChar) {
        // 验证是否匹配整个句子的尾部
        const endCheckLen = Math.min(10, cleanSentence.length);
        let endMatched = 0;
        for (let j = 0; j < endCheckLen; j++) {
          const sentCharIdx = cleanSentence.length - endCheckLen + j;
          const wordCharIdx = i - endCheckLen + 1 + j;
          if (sentCharIdx >= 0 && wordCharIdx >= 0 && wordCharIdx < words.length) {
            if (cleanSentence[sentCharIdx] === words[wordCharIdx]?.text) {
              endMatched++;
            }
          }
        }

        const matchScore = endMatched / endCheckLen;
        const lengthMatch = 1 - Math.abs((i - startIdx + 1) - targetLen) / targetLen;
        const totalScore = matchScore * 0.6 + lengthMatch * 0.4; // 60%内容匹配 + 40%长度匹配

        if (totalScore > bestEndScore && matchScore > 0.6) {
          bestEndScore = totalScore;
          bestEndIdx = i;
        }
      }
    }

    endIdx = bestEndIdx;

    if (endIdx < startIdx) {
      console.warn(`[Align] Failed to find end for sentence ${sentIdx}: "${sentence.substring(0, 20)}..."`);
      return null;
    }

    console.log(`[Align] Sentence ${sentIdx} matched: words[${startIdx}-${endIdx}], time=${words[startIdx].start.toFixed(2)}-${words[endIdx].end.toFixed(2)}`);

    result.push({
      id: result.length,
      seek: 0,
      start: words[startIdx].start,
      end: words[endIdx].end,
      text: sentence, // 保留原始标点!
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    });

    wordIdx = endIdx + 1; // 下一句从这里开始查找
  }

  console.log(`[Align] Word-level alignment succeeded: ${result.length} segments created`);
  return result;
}

// 方案5实现：基于位置而非内容的对齐策略
// 不依赖内容匹配，而是按照anchors和润色句子的数量比例进行映射
// 这样可以避免LLM改写导致的匹配失败，同时保持时间戳的准确性
export function alignSentencesWithAnchors(
  finalText: string,
  anchors: Array<{ start: number; end: number; text: string }> | undefined,
  lang?: string,
  _options?: {
    wordUnits?: Array<{ start: number; end: number; text: string }>;
    advancedSplit?: boolean;
  }
): TranscriptionSegment[] {
  if (!anchors || anchors.length === 0) return [];
  if (!finalText || finalText.trim().length === 0) {
    // 如果没有润色文本，直接使用原始anchors
    return anchors.map((anchor, i) => ({
      id: i,
      seek: 0,
      start: anchor.start,
      end: anchor.end,
      text: anchor.text || '',
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    }));
  }

  // 将润色后的文本按句子分割
  const sentences = splitIntoSentences(finalText, lang);

  // 策略1: 如果有wordUnits，优先尝试字级精确对齐
  if (_options?.wordUnits && _options.wordUnits.length > 0) {
    console.log(`[Align] Attempting word-level alignment with ${_options.wordUnits.length} words`);
    try {
      const wordLevelResult = alignSentencesWithWordLevel(sentences, _options.wordUnits, lang);
      if (wordLevelResult) {
        console.log(`[Align] ✅ Word-level alignment successful: ${wordLevelResult.length} segments`);
        return wordLevelResult;
      }
      console.warn('[Align] ⚠️ Word-level alignment failed, fallback to anchor ratio alignment');
    } catch (e) {
      console.warn('[Align] ❌ Word-level alignment error:', e);
    }
  } else {
    console.log(`[Align] No wordUnits provided (wordUnits=${_options?.wordUnits?.length || 0}), skipping word-level alignment`);
  }

  // 策略2: 降级到基于位置比例的对齐（原有逻辑）
  console.log(`[Align] Using position-based alignment (fallback): ${anchors.length} anchors, finalText length: ${finalText.length}`);

  if (sentences.length === 0) {
    console.warn('[Align] No sentences found in finalText, using original anchors');
    return anchors.map((anchor, i) => ({
      id: i,
      seek: 0,
      start: anchor.start,
      end: anchor.end,
      text: anchor.text || '',
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    }));
  }

  console.log(`[Align] Split into ${sentences.length} sentences from ${anchors.length} anchors`);

  // 策略：按比例将润色后的句子映射到原始anchors的时间戳
  // 两种情况：
  // 1. 句子数 <= anchors数：每个句子占用多个anchors (ratio >= 1)
  // 2. 句子数 > anchors数：多个句子共享anchors，按时间线性插值 (ratio < 1)

  const result: TranscriptionSegment[] = [];

  if (sentences.length <= anchors.length) {
    // 情况1：句子少，每个句子可以精确映射到anchor范围
    const ratio = anchors.length / sentences.length;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      const startAnchorIdx = Math.floor(i * ratio);
      const endAnchorIdx = Math.min(
        Math.ceil((i + 1) * ratio) - 1,
        anchors.length - 1
      );

      const start = anchors[startAnchorIdx].start;
      const end = anchors[endAnchorIdx].end;

      result.push({
        id: i,
        seek: 0,
        start: Math.max(0, start),
        end: Math.max(start, end),
        text: sentence,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      });
    }
  } else {
    // 情况2：句子多于anchors，需要按时间线性插值
    // 计算总时长
    const totalDuration = anchors[anchors.length - 1].end - anchors[0].start;
    const startTime = anchors[0].start;

    // 按文本长度比例分配时间
    const totalTextLength = sentences.reduce((sum, s) => sum + s.length, 0);
    let cumulativeLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;

      // 计算这个句子的起始和结束时间（按文本长度比例）
      const start = startTime + (cumulativeLength / totalTextLength) * totalDuration;
      const end = startTime + ((cumulativeLength + sentenceLength) / totalTextLength) * totalDuration;

      cumulativeLength += sentenceLength;

      result.push({
        id: i,
        seek: 0,
        start: Math.max(0, start),
        end: Math.max(start, end),
        text: sentence,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      });
    }

    console.log(`[Align] Using interpolation: ${sentences.length} sentences from ${anchors.length} anchors`);
  }

  console.log(`[Align] Position-based alignment completed: ${result.length} segments created`);

  return result;
}

// 对于没有anchors但有words的情况，简单回退处理
export function alignSentencesWithWordTimeline(
  finalText: string,
  wordUnits: Array<{ start: number; end: number; text: string }> | undefined,
  lang?: string,
  totalDurationSec?: number,
  anchors?: Array<{ start: number; end: number; text: string }>
): TranscriptionSegment[] {
  // 如果有anchors，优先使用anchors（方案2）
  if (anchors && anchors.length > 0) {
    return alignSentencesWithAnchors(finalText, anchors, lang);
  }
  
  // 如果没有anchors但有words，使用简单的句子分割
  const sentences = splitIntoSentences(finalText, lang);
  if (!sentences.length || !wordUnits || wordUnits.length === 0) return [];
  
  // 简单地根据句子长度比例分配时间
  const totalDuration = totalDurationSec || (wordUnits[wordUnits.length - 1]?.end || 0);
  const textLength = finalText.length;
  let currentPos = 0;
  
  return sentences.map((sentence, i) => {
    const sentenceRatio = sentence.length / textLength;
    const duration = totalDuration * sentenceRatio;
    const start = currentPos;
    const end = currentPos + duration;
    currentPos = end;
    
    return {
      id: i,
      seek: 0,
      start: Math.min(start, totalDuration),
      end: Math.min(end, totalDuration),
      text: sentence,
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0
    };
  });
}
