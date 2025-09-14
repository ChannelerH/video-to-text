// Local-only Chinese punctuation normalization and conservative sentence restoration

const CJK = /[\u4e00-\u9fff]/g;
const LATIN = /[A-Za-z]/g;

function count(re: RegExp, s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(re);
  return m ? m.length : 0;
}

/**
 * Strict Chinese detection.
 * Must satisfy BOTH:
 * - language contains 'zh'
 * - CJK chars are significant (>= 30 OR >= 5% of visible letters) AND greater than latin letters by 20%
 */
export function isChineseLangOrText(language?: string, text?: string): boolean {
  const langZh = !!language && language.toLowerCase().includes('zh');
  if (!langZh || !text) return false;
  const cjk = count(CJK, text);
  const latin = count(LATIN, text);
  const letters = cjk + latin;
  const ratioOk = letters > 0 ? (cjk / letters) >= 0.05 : cjk >= 30; // 5% threshold
  const absOk = cjk >= 30; // absolute floor
  const dominance = cjk > latin * 1.2; // “明显大于”
  return (ratioOk || absOk) && dominance;
}

export function localChinesePunctuate(text: string): string {
  if (!text) return text;
  let t = text;
  // normalize whitespace
  t = t.replace(/[\t\r\f]+/g, ' ').replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ');
  // join spaced digits like "2 5 5" -> "255"
  t = t.replace(/(\d)\s+(?=\d)/g, '$1');
  // remove spaces between CJK
  t = t.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1');
  // add spaces between CJK and Latin/number
  t = t.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
       .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
  // ascii -> cn punctuation around CJK
  t = t.replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，')
       .replace(/([\u4e00-\u9fff])\s*\.\s*/g, '$1。')
       .replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；')
       .replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：')
       .replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！')
       .replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？');
  // quotes / brackets
  t = t.replace(/"([^"]+)"/g, '“$1”')
       .replace(/'([^']+)'/g, '‘$1’')
       .replace(/\(/g, '（').replace(/\)/g, '）');
  // compress repeats
  t = t.replace(/，{2,}/g, '，')
       .replace(/。{2,}/g, '。')
       .replace(/！{2,}/g, '！')
       .replace(/？{2,}/g, '？');
  // trim around punctuation
  t = t.replace(/\s*([，。！？；：、“”‘’（）：])\s*/g, '$1');
  return t;
}

function heuristicPunctuateChinese(text: string): string {
  if (!text) return text;
  let t = text;
  // comma before connectors
  const CONNECT = /(因为|由于|如果|虽然|但是|然而|不过|而且|另外|其次|最后|所以|因此|那么|然后|此外|比如|例如)/g;
  t = t.replace(new RegExp(`([\u4e00-\u9fff])(\s*)(${CONNECT.source})`, 'g'), (_m, a, _sp, b) => `${a}，${b}`);
  // question particles
  t = t.replace(/(吗|呢|吧)(?![。！？？]\s*$)/g, '$1？');
  return localChinesePunctuate(t);
}

export function localPunctuateSegmentsIfChinese(
  segments: { text: string; start?: number; end?: number }[] | undefined,
  language?: string
): number {
  if (!segments || segments.length === 0) return 0;
  const isZh = isChineseLangOrText(language, segments.map(s => s.text).join(''));
  if (!isZh) return 0;
  let changed = 0;
  for (let i = 0; i < segments.length; i++) {
    const s: any = segments[i];
    const orig = (s.text || '').trim();
    let now = localChinesePunctuate(orig);
    if (/[\u4e00-\u9fff]/.test(now) && !/[。！？]/.test(now)) {
      now = heuristicPunctuateChinese(now);
    }
    const endsWithPunct = /[。！？…]$/.test(now) || /[”’）】]$/.test(now) || /[.!?]$/.test(now);
    if (!endsWithPunct && /[\u4e00-\u9fff]/.test(now)) {
      const duration = typeof s.start === 'number' && typeof s.end === 'number' ? (s.end - s.start) : 0;
      const next = segments[i + 1] as any;
      const gap = next && typeof next.start === 'number' && typeof s.end === 'number' ? (next.start - s.end) : 0;
      if (/[吗呢吧]$/.test(now)) {
        now += '？';
      } else {
        const likelyPeriod = (duration >= 3.2) || (gap >= 1.0);
        const likelyComma = !likelyPeriod && ((duration >= 1.6) || (gap >= 0.6));
        if (likelyPeriod) now += '。';
        else if (likelyComma) now += '，';
      }
    }
    if (now !== orig) { s.text = now; changed++; }
  }
  return changed;
}

export function rebuildTextFromSegments(segments: { text: string }[]): string {
  return (segments || []).map(s => String(s.text || '').trim()).join('');
}
