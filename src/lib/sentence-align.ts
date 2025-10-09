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

  console.log(`[Align] Using position-based alignment (方案5): ${anchors.length} anchors, finalText length: ${finalText.length}`);

  // 将润色后的文本按句子分割
  const sentences = splitIntoSentences(finalText, lang);

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
  // 例如：10个句子，15个anchors → 每1.5个anchor对应1个句子
  const ratio = anchors.length / sentences.length;

  const result: TranscriptionSegment[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // 计算这个句子对应的anchor范围
    const startAnchorIdx = Math.floor(i * ratio);
    const endAnchorIdx = Math.min(
      Math.floor((i + 1) * ratio),
      anchors.length
    ) - 1;

    // 确保索引有效
    const safeStartIdx = Math.max(0, Math.min(startAnchorIdx, anchors.length - 1));
    const safeEndIdx = Math.max(safeStartIdx, Math.min(endAnchorIdx, anchors.length - 1));

    const startAnchor = anchors[safeStartIdx];
    const endAnchor = anchors[safeEndIdx];

    // 使用anchor的原始时间戳
    const start = startAnchor.start;
    const end = endAnchor.end;

    // 验证时间戳有效性
    if (start >= 0 && end >= start) {
      result.push({
        id: i,
        seek: 0,
        start,
        end,
        text: sentence,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      });
    } else {
      // 时间戳异常，记录警告但仍然添加（使用修正后的时间戳）
      console.warn(`[Align] Invalid timestamp for sentence ${i}: start=${start}, end=${end}, using corrected values`);
      result.push({
        id: i,
        seek: 0,
        start: Math.max(0, start),
        end: Math.max(Math.max(0, start), end),
        text: sentence,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      });
    }
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
