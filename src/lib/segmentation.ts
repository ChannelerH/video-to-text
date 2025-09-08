import { TranscriptionResult, TranscriptionSegment } from './replicate';

// Utilities to refine coarse segments into sentence-level segments with estimated timestamps.

const CJK = /[\u4e00-\u9fff]/;

function isChinese(text?: string): boolean {
  return !!text && CJK.test(text);
}

function splitChineseSentences(text: string): string[] {
  // Keep ending punctuation and trailing quotes/brackets with the sentence
  // Example boundaries: 。！？； optionally followed by ” ’ ） 】
  const re = /[^。！？；]+[。！？；]?[”’）】]?/g;
  const parts = (text || '').trim().match(re) || [];
  return parts.map(s => s.trim()).filter(Boolean);
}

function splitLatinSentences(text: string): string[] {
  // Split on . ! ? followed by whitespace or EOS; keep the punctuation in the sentence.
  const parts = (text || '').trim().split(/(?<=[.!?])\s+/g).map(s => s.trim()).filter(Boolean);
  if (parts.length > 0) return parts;
  return text ? [text.trim()] : [];
}

function proportionalSplitTimes(start: number, end: number, pieces: string[]): Array<[number, number]> {
  const total = pieces.reduce((acc, p) => acc + (p.replace(/\s+/g, '').length || 1), 0);
  const dur = Math.max(0, end - start);
  let cursor = start;
  const times: Array<[number, number]> = [];
  for (let i = 0; i < pieces.length; i++) {
    const weight = (pieces[i].replace(/\s+/g, '').length || 1) / (total || 1);
    // Avoid zero-length; enforce minimum 0.4s for audible sentence
    const span = i === pieces.length - 1 ? (start + dur - cursor) : Math.max(0.4, dur * weight);
    const s = cursor;
    const e = Math.min(start + dur, s + span);
    times.push([Number(s.toFixed(3)), Number(e.toFixed(3))]);
    cursor = e;
  }
  // Ensure strictly increasing and last == end
  if (times.length) {
    times[times.length - 1][1] = Number(end.toFixed(3));
    for (let i = 1; i < times.length; i++) {
      if (times[i][0] < times[i - 1][1]) times[i][0] = times[i - 1][1];
      if (times[i][1] < times[i][0]) times[i][1] = times[i][0] + 0.01;
    }
  }
  return times;
}

function furtherSplitByCommaIfLong(pieces: string[], maxChars = 68): string[] {
  const out: string[] = [];
  for (const p of pieces) {
    if (p.replace(/\s+/g, '').length <= maxChars) { out.push(p); continue; }
    // Prefer Chinese comma, then ASCII comma
    const commas = p.split(/[，,]/g).map(s => s.trim()).filter(Boolean);
    if (commas.length > 1) {
      commas.forEach((c, idx) => out.push(idx < commas.length - 1 ? c + '，' : c));
    } else {
      out.push(p);
    }
  }
  return out;
}

export function refineSegmentsFineGrained(transcription: TranscriptionResult): void {
  const orig = transcription.segments || [];
  if (!orig.length) return;
  const zh = isChinese((transcription.text || '') + orig.map(s => s.text).join(''));

  const refined: TranscriptionSegment[] = [];
  let nextId = 0;

  for (const seg of orig) {
    const text = (seg.text || '').trim();
    if (!text) continue;

    const pieces0 = zh ? splitChineseSentences(text) : splitLatinSentences(text);
    const pieces = furtherSplitByCommaIfLong(pieces0);

    if (pieces.length <= 1) {
      refined.push({ ...seg, id: nextId++ });
      continue;
    }

    const times = proportionalSplitTimes(seg.start, seg.end, pieces);
    for (let i = 0; i < pieces.length; i++) {
      refined.push({
        ...seg,
        id: nextId++,
        start: times[i][0],
        end: times[i][1],
        text: pieces[i]
      });
    }
  }

  // Replace segments in-place
  transcription.segments = refined;
}

