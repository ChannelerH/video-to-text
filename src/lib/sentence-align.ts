import { TranscriptionSegment } from './replicate';
import { isChineseLangOrText, localChinesePunctuate } from './refine-local';

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

// 方案2实现：直接使用Deepgram的sentence anchors，保持时间戳不变，使用LLM润色文本
// 用于处理Deepgram提供的精确句子级时间戳
export function alignSentencesWithAnchors(
  finalText: string,
  anchors: Array<{ start: number; end: number; text: string }> | undefined,
  lang?: string,
  options?: {
    wordUnits?: Array<{ start: number; end: number; text: string }>;
    advancedSplit?: boolean;
  }
): TranscriptionSegment[] {
  if (!anchors || anchors.length === 0) return [];
  
  // 判断是否为中文内容
  const concat = anchors.map(a => a.text).join('');
  const isZh = /[\u4e00-\u9fff]/.test(concat) || isChineseLangOrText(lang, concat);
  
  console.log(`[Align] Using anchors (方案2): ${anchors.length} sentences, finalText length: ${finalText?.length || 0}`);
  
  // 查找问题段落在finalText中的位置
  if (finalText) {
    const problemStart = finalText.indexOf('因为我只有十块');
    if (problemStart !== -1) {
      console.log(`[Align Debug] Found problem segment in finalText at position ${problemStart}`);
      console.log(`[Align Debug] Problem segment in finalText: "${finalText.substring(problemStart, problemStart + 200)}..."`);
    } else {
      console.log(`[Align Debug] Problem segment NOT FOUND in finalText!`);
    }
  }
  
  // 清理函数：去除空格和标点，用于内容匹配
  const normalize = (text: string): string => {
    if (!text) return '';
    // 去除所有空格和标点，只保留文字内容
    return text.replace(/[\s\p{P}]/gu, '');
  };
  
  // 构建原始内容到润色内容的映射
  const normalizedAnchors = anchors.map(a => normalize(a.text));
  const normalizedFinal = normalize(finalText || '');
  
  // 在润色文本中找到每个anchor对应的内容
  let searchStartPos = 0;
  
  return anchors.map((anchor, i) => {
    const normalizedAnchor = normalizedAnchors[i];
    
    // 调试日志：显示处理的anchor
    if (anchor.start > 280 && anchor.start < 464) {
      console.log(`[Align Debug] Anchor ${i}: ${anchor.start.toFixed(2)}-${anchor.end.toFixed(2)}`);
      console.log(`[Align Debug] Original text (first 100 chars): ${anchor.text.substring(0, 100)}...`);
      console.log(`[Align Debug] Normalized anchor: ${normalizedAnchor?.substring(0, 50)}...`);
    }
    
    if (!normalizedAnchor || !normalizedFinal || !finalText) {
      // 如果没有内容，返回原始文本
      let text = anchor.text || '';
      if (isZh) {
        text = text.replace(/\s+/g, '');
        text = localChinesePunctuate(text);
      }
      
      if (anchor.start > 280 && anchor.start < 464) {
        console.log(`[Align Debug] No normalized content, using basic processing`);
      }
      
      return {
        id: i,
        seek: 0,
        start: anchor.start,
        end: anchor.end,
        text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      };
    }
    
    // 在标准化的润色文本中找到对应内容的位置
    const pos = normalizedFinal.indexOf(normalizedAnchor, searchStartPos);
    
    if (anchor.start > 280 && anchor.start < 464) {
      console.log(`[Align Debug] Search position: ${pos}, searchStartPos: ${searchStartPos}`);
    }
    
    if (pos !== -1) {
      // 找到了对应内容，计算在原始finalText中的位置
      // 需要将标准化位置映射回原始文本位置
      let charCount = 0;
      let realStartPos = 0;
      let realEndPos = finalText.length;
      
      // 找到开始位置
      for (let j = 0; j < finalText.length; j++) {
        if (normalize(finalText[j])) {
          if (charCount === pos) {
            realStartPos = j;
            break;
          }
          charCount++;
        }
      }
      
      // 找到结束位置
      charCount = 0;
      for (let j = 0; j < finalText.length; j++) {
        if (normalize(finalText[j])) {
          if (charCount === pos + normalizedAnchor.length) {
            realEndPos = j;
            break;
          }
          charCount++;
        }
      }
      
      // 扩展到完整的句子边界
      // 向前找到句子开始（如果不是第一个segment）
      if (i > 0) {
        while (realStartPos > 0 && !/[。！？；.!?]/.test(finalText[realStartPos - 1])) {
          realStartPos--;
        }
      }
      
      // 向后找到句子结束
      while (realEndPos < finalText.length && !/[。！？；.!?]/.test(finalText[realEndPos - 1])) {
        realEndPos++;
      }
      
      const refinedText = finalText.substring(realStartPos, realEndPos).trim();
      searchStartPos = pos + normalizedAnchor.length;
      
      if (anchor.start > 280 && anchor.start < 464) {
        console.log(`[Align Debug] Found match! Refined text: ${refinedText.substring(0, 100)}...`);
        console.log(`[Align Debug] Text length: original=${anchor.text.length}, refined=${refinedText.length}`);
      }
      
      return {
        id: i,
        seek: 0,
        start: anchor.start,
        end: anchor.end,
        text: refinedText,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      };
    } else {
      // 没找到匹配，使用原始文本
      console.warn(`[Align] No match found for anchor ${i}: "${anchor.text.substring(0, 30)}..."`);
      
      if (anchor.start > 280 && anchor.start < 464) {
        console.log(`[Align Debug] NO MATCH FOUND! Using fallback processing`);
        console.log(`[Align Debug] This is why the text quality is poor for this segment`);
      }
      
      let text = anchor.text || '';
      if (isZh) {
        text = text.replace(/\s+/g, '');
        text = localChinesePunctuate(text);
      }
      return {
        id: i,
        seek: 0,
        start: anchor.start,
        end: anchor.end,
        text,
        tokens: [],
        temperature: 0,
        avg_logprob: 0,
        compression_ratio: 1,
        no_speech_prob: 0
      };
    }
  });
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

// 一对一映射：保持原始segments的时间戳，只更新文本内容
// 用于Deepgram sentences + LLM润色的场景
export function alignSentencesOneToOne(
  finalText: string,
  originalSegments: TranscriptionSegment[],
  lang?: string,
  duration?: number  // 为了保持接口一致，虽然不使用
): TranscriptionSegment[] {
  if (!originalSegments || originalSegments.length === 0) return [];
  
  // 构建原始segments的累积文本，用于在finalText中定位
  const originalTexts = originalSegments.map(s => {
    // 清理文本用于匹配（去除多余空格）
    const text = (s.text || '').trim();
    return text.replace(/\s+/g, lang?.includes('zh') ? '' : ' ');
  });
  
  // 清理finalText用于匹配
  const cleanFinal = finalText.replace(/\s+/g, lang?.includes('zh') ? '' : ' ').trim();
  
  // 创建累积长度数组，用于在finalText中定位每个segment
  let cumulative = 0;
  const positions = originalTexts.map(text => {
    const start = cumulative;
    cumulative += text.length;
    return { start, end: cumulative };
  });
  
  console.log(`[Align] One-to-one mapping: ${originalSegments.length} segments, finalText length: ${finalText.length}`);
  
  // 基于位置比例，从finalText中提取对应的润色文本
  const totalOriginalLength = cumulative;
  const result = originalSegments.map((seg, idx) => {
    if (totalOriginalLength === 0) {
      return { ...seg, text: seg.text };
    }
    
    // 计算这个segment在原始文本中的位置比例
    const pos = positions[idx];
    const startRatio = pos.start / totalOriginalLength;
    const endRatio = pos.end / totalOriginalLength;
    
    // 映射到finalText中的位置
    const finalStart = Math.floor(startRatio * finalText.length);
    const finalEnd = Math.ceil(endRatio * finalText.length);
    
    // 提取对应的文本片段
    let extractedText = finalText.substring(finalStart, finalEnd).trim();
    
    // 如果是中文，尝试在句号、问号、感叹号处调整边界
    if (lang?.includes('zh') && extractedText) {
      // 检查是否需要包含前面的标点
      if (finalStart > 0 && /[。！？]/.test(finalText[finalStart - 1])) {
        extractedText = finalText[finalStart - 1] + extractedText;
      }
      // 向后查找最近的句号
      if (finalEnd < finalText.length - 1) {
        const remaining = finalText.substring(finalEnd);
        const match = remaining.match(/^[^。！？]*[。！？]/);
        if (match && match[0].length < 20) {
          extractedText += match[0];
        }
      }
    }
    
    return {
      ...seg,
      text: extractedText || seg.text // 如果提取失败，保留原文
    };
  });
  
  return result;
}
