function splitForLLM(text: string, maxLen = 1800): string[] {
  const chunks: string[] = [];
  let buf = '';
  const boundaries = /[。！？；：、，\n\r\s]/;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    const atBoundary = boundaries.test(ch);
    if (buf.length >= maxLen && atBoundary) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text];
}

export async function refineTextIfChinese(text: string, language?: string): Promise<string | null> {
  try {
    const hasChinese = (language && language.toLowerCase().includes('zh')) || /[\u4e00-\u9fff]/.test(text || '');
    if (!hasChinese) return null;

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const apiBase = process.env.DEEPSEEK_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat';

    // 若未配置模型 API，则退回到本地规则化（不改变含义，只处理标点/空格）
    if (!apiKey) {
      const local = localChinesePunctuate(text);
      if (local !== text) console.log('[Refine] local text normalized (no API key)');
      return local;
    }

    const system = 'You are a strict copy editor for Chinese. Restore proper punctuation and sentence boundaries where missing. Only adjust punctuation, line breaks, and CJK/Latin spacing. Do not translate; do not add or remove words.';
    const user = `Language: ${language || 'zh'}\nRules:\n- Use Chinese punctuation（，。！？；：、“”‘’）;\n- Remove extra spaces inside Chinese;\n- Add spaces between Chinese and Latin/number;\n- Add missing commas/periods based on natural syntax;\n- Keep names and numbers; do not paraphrase;\n- Return plain text only.\n\nText:\n${text}`;

    console.log(`[Refine] calling LLM provider base=${apiBase} model=${model}`);
    // 对长文本分块处理，避免超出 token 限制
    const parts = splitForLLM(text, 1800);
    let refinedAll = '';
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user.replace(/\nText:[\s\S]*$/, `\nText:\n${part}`) }
          ],
          temperature: 0.2,
          max_tokens: 1200,
        })
      });
      if (!resp.ok) {
        console.warn('[Refine] chunk request failed, fallback to local, status=', resp.status);
        refinedAll += localChinesePunctuate(part);
        continue;
      }
      const data = await resp.json();
      const out = data?.choices?.[0]?.message?.content?.trim();
      refinedAll += (out || localChinesePunctuate(part));
    }
    if (refinedAll && refinedAll !== text) console.log('[Refine] text refined by LLM');
    return refinedAll || text;
  } catch {
    // 异常时退回本地规则化
    const local = localChinesePunctuate(text);
    return local;
  }
}

// Lightweight local cleanup that preserves timestamps by only touching text content
const CJK = /[\u4e00-\u9fff]/;

export function localChinesePunctuate(text: string): string {
  if (!text) return text;
  let t = text;
  // normalize whitespace
  t = t.replace(/[\t\r\f]+/g, ' ').replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ');
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
  // trim spaces around punctuation
  t = t.replace(/\s*([，。！？；：、“”‘’（）：])\s*/g, '$1');
  return t;
}

// Heuristic punctuation restoration for Chinese (no wording change)
// Conservative: only add when there are strong cues (particles/connectors),
// never based on sheer length alone.
function heuristicPunctuateChinese(text: string): string {
  if (!text) return text;
  let t = text;
  // Comma before clause-level connectors (if missing and surrounded by CJK)
  const CONNECT = /(因为|由于|如果|虽然|但是|然而|不过|而且|另外|其次|最后|所以|因此|那么|然后|此外|比如|例如)/g;
  t = t.replace(new RegExp(`([\u4e00-\u9fff])(\s*)(${CONNECT.source})`, 'g'), (m, a, sp, b) => `${a}，${b}`);

  // Question particles imply question mark at end (if none)
  t = t.replace(/(吗|呢|吧)(?![。！？？]\s*$)/g, '$1？');

  // Clean up repeated punctuation and spacing
  t = localChinesePunctuate(t);
  return t;
}

export function localPunctuateSegmentsIfChinese(segments: { text: string }[] | undefined, language?: string): number {
  if (!segments || segments.length === 0) return 0;
  const isZh = (language && language.toLowerCase().includes('zh')) || segments.some(s => CJK.test(s.text));
  if (!isZh) return 0;
  let changed = 0;
  for (let i = 0; i < segments.length; i++) {
    const s: any = segments[i] as any;
    const orig = (s.text || '').trim();
    let now = localChinesePunctuate(orig);
    // Heuristic restoration pass to inject minimal commas/periods when missing
    if (/[\u4e00-\u9fff]/.test(now) && !/[。！？]/.test(now)) {
      now = heuristicPunctuateChinese(now);
    }

    // 若末尾无中文终止标点，依据“停顿/时长/语气词”补标点（不根据纯长度）
    const endsWithPunct = /[。！？…]$/.test(now) || /[”’）】]$/.test(now) || /[.!?]$/.test(now);
    if (!endsWithPunct && /[\u4e00-\u9fff]/.test(now)) {
      const duration = typeof s.start === 'number' && typeof s.end === 'number' ? (s.end - s.start) : 0;
      const next = segments[i + 1] as any;
      const gap = next && typeof next.start === 'number' && typeof s.end === 'number' ? (next.start - s.end) : 0;
      if (/[吗呢吧]$/.test(now)) {
        now += '？';
      } else {
        // More aggressive thresholds: period(gap≥1.0s or dur≥3.2s), comma(gap≥0.6s or dur≥1.6s)
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
