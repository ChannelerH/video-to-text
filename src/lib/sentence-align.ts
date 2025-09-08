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
      no_speech_prob: 0
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

