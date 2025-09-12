export interface SegmentLike {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface SpeakerSuggestion {
  name: string;
  score: number;
}

const CJK_NAME_RE = /[\u4e00-\u9fff]{2,4}/g;
const CJK_TITLES = /(老师|博士|经理|主任|总监|先生|女士|小姐|同学|总)$/;

const EN_NAME_TOKEN = /[A-Z][a-z]+(?:-[A-Z][a-z]+)?/;

function normalizeCandidate(raw: string): string {
  let s = (raw || '').trim();
  // strip common titles (CJK)
  s = s.replace(CJK_TITLES, '');
  // collapse extra spaces
  s = s.replace(/\s{2,}/g, ' ');
  // trim punctuation
  s = s.replace(/^[\s,.:;"'·-]+|[\s,.:;"'·-]+$/g, '');
  return s;
}

function extractFromSelfIntro(text: string): string[] {
  const out: string[] = [];
  const t = text || '';
  // CN: 我叫X / 我是X / 我的名字叫X / 大家好，我是X
  const cnRules: RegExp[] = [
    /(?:大家好[，,\s]*)?我(?:叫|是|的名字叫)\s*([\u4e00-\u9fff]{2,4}(?:老师|博士|经理|主任|总监|先生|女士|小姐|同学|总)?)/,
    /([\u4e00-\u9fff]{2,4})(?:，?我是)/
  ];
  for (const re of cnRules) {
    const m = t.match(re);
    if (m && m[1]) out.push(normalizeCandidate(m[1]));
  }

  // EN: I'm X / I am X / My name is X / This is X / Hi, I'm X
  const enRules: RegExp[] = [
    /\b(?:I['’]m|I am|This is|My name is)\s+((?:[A-Z][a-z]+(?:\s+|$)){1,3})/,
    /\b(?:Hi|Hello|Hey)[,!]?\s*(?:I['’]m|I am)\s+((?:[A-Z][a-z]+(?:\s+|$)){1,3})/
  ];
  for (const re of enRules) {
    const m = t.match(re);
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/\s+/g, ' ');
      out.push(normalizeCandidate(candidate));
    }
  }
  return out.filter(Boolean);
}

function extractFromAddressing(text: string): string[] {
  const out: string[] = [];
  const t = text || '';
  // CN addressing: X你看 / 谢谢你X / X老师/博士/总/经理...
  const cnPairs: RegExp[] = [
    /([\u4e00-\u9fff]{2,4})(?:你看|你说|您好|谢谢)/,
    /(?:谢谢你|多谢|拜托)([\u4e00-\u9fff]{2,4})/,
    /([\u4e00-\u9fff]{2,4})(老师|博士|经理|主任|总监|先生|女士|小姐|同学|总)/
  ];
  for (const re of cnPairs) {
    const m = t.match(re);
    if (m && m[1]) out.push(normalizeCandidate(m[1]));
  }

  // EN addressing: thanks X / hey X / Mr./Dr. X
  const enPairs: RegExp[] = [
    /\b(?:thanks|thank you|hey|hi)\s+((?:[A-Z][a-z]+\s*){1,2})\b/,
    /\b(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+)\b/
  ];
  for (const re of enPairs) {
    const m = t.match(re);
    if (m && m[1]) out.push(normalizeCandidate(m[1]));
  }
  return out.filter(Boolean);
}

/**
 * Compute speaker name suggestions from segments with diarization.
 */
export function suggestSpeakerNames(segments: SegmentLike[]): Record<string, SpeakerSuggestion[]> {
  const scores: Record<string, Record<string, number>> = {};
  const totalDuration = segments.length ? (segments[segments.length - 1].end || segments[0].end || 0) : 0;

  for (const seg of segments) {
    if (!seg.speaker || !seg.text) continue;
    const sid = String(seg.speaker);
    scores[sid] = scores[sid] || {};

    const tsWeight = 1 + Math.max(0, (totalDuration ? (totalDuration - seg.start) / totalDuration : 1) * 0.5); // earlier gets slightly higher weight

    // Self-intro: high weight
    const intros = extractFromSelfIntro(seg.text);
    for (const name of intros) {
      scores[sid][name] = (scores[sid][name] || 0) + 5 * tsWeight;
    }

    // Addressing: medium weight
    const calls = extractFromAddressing(seg.text);
    for (const name of calls) {
      scores[sid][name] = (scores[sid][name] || 0) + 2 * tsWeight;
    }
  }

  // Build sorted suggestions
  const result: Record<string, SpeakerSuggestion[]> = {};
  for (const sid of Object.keys(scores)) {
    const arr = Object.entries(scores[sid])
      .map(([name, score]) => ({ name, score }))
      .filter(s => s.name && s.score > 0)
      .sort((a, b) => b.score - a.score);
    result[sid] = arr.slice(0, 5);
  }
  return result;
}

