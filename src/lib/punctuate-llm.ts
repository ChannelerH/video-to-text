// LLM-based Chinese punctuation/segmentation normalizer (OpenAI-compatible API)
// Scope: only adjust punctuation, sentence breaks, and CJK/Latin spacing.
// Never translate or change wording.

export interface PunctuateOptions {
  language?: string;
  chunkSize?: number; // characters per chunk
  concurrency?: number; // parallel requests per batch
  batchDelayMs?: number; // delay between batches
}

function getLLMConfig() {
  const apiKey = process.env.PUNCTUATE_LLM_KEY
    || process.env.DEEPSEEK_API_KEY
    || process.env.OPENAI_API_KEY
    || '';
  const apiBase = process.env.PUNCTUATE_LLM_BASE
    || process.env.DEEPSEEK_API_BASE
    || process.env.OPENAI_BASE_URL
    || 'https://api.deepseek.com/v1';
  const model = process.env.PUNCTUATE_LLM_MODEL
    || process.env.DEEPSEEK_MODEL
    || process.env.OPENAI_MODEL
    || 'deepseek-chat';
  return { apiKey, apiBase, model };
}

function chunkText(input: string, maxLen: number): string[] {
  if (!input) return [];
  const chunks: string[] = [];
  let buf = '';
  const strong = /[。！？]/;
  const soft = /[；：，]/;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    buf += ch;
    if (buf.length >= maxLen * 0.8 && strong.test(ch)) {
      chunks.push(buf);
      buf = '';
    } else if (buf.length >= maxLen && soft.test(ch)) {
      chunks.push(buf);
      buf = '';
    } else if (buf.length >= maxLen * 1.2) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export async function punctuateTextLLM(text: string, opts: PunctuateOptions = {}): Promise<string | null> {
  try {
    const enabled = process.env.PUNCTUATE_LLM_ENABLED === 'true';
    if (!enabled) return null;
    const { apiKey, apiBase, model } = getLLMConfig();
    if (!apiKey) return null;

    const language = opts.language || 'zh';
    // Safeguard: only run for sufficiently Chinese text
    if (language.toLowerCase().includes('zh')) {
      const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
      const latin = (text.match(/[A-Za-z]/g) || []).length;
      const letters = cjk + latin;
      const sparse = cjk < 30 || (letters > 0 && cjk / letters < 0.05);
      if (sparse) return null; // skip LLM for non-Chinese majority text
    } else {
      // Non zh language: never run the Chinese LLM normalizer
      return null;
    }
    const maxLen = Math.max(1200, Math.min(2400, opts.chunkSize || parseInt(process.env.PUNCTUATE_LLM_CHUNK_SIZE || '1800')));
    const parts = chunkText(text, maxLen);
    const concurrency = Math.max(1, Math.min(8, opts.concurrency || parseInt(process.env.PUNCTUATE_LLM_CONCURRENCY || '3')));
    const batchDelayMs = Math.max(0, opts.batchDelayMs ?? parseInt(process.env.PUNCTUATE_LLM_BATCH_DELAY_MS || '150'));
    console.log(`[Punct][LLM] enabled: base=${apiBase} model=${model} chunks=${parts.length} cc=${concurrency} delay=${batchDelayMs}ms`);

    const system = 'You are a strict Chinese copy editor. Only restore missing punctuation, sentence breaks, and CJK/Latin spacing. Never translate or change wording. Return plain text in the original language.';

    const results: string[] = new Array(parts.length);

    const doOne = async (idx: number) => {
      const part = parts[idx];
      const user = `Language: ${language}\nRules:\n- Use Chinese punctuation（，。！？；：、“”‘’）;\n- Add missing commas/periods based on natural syntax;\n- Keep wording identical; adjust only punctuation/spacing;\n- Return text only.\n\nText:\n${part}`;
      try {
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
              { role: 'user', content: user }
            ],
            temperature: 0.2,
            max_tokens: 1500
          })
        });
        if (!resp.ok) {
          console.warn(`[Punct][LLM] chunk ${idx+1}/${parts.length} failed: status=${resp.status}`);
          results[idx] = part; // fail-soft per chunk
          return;
        }
        const data = await resp.json();
        const piece = data?.choices?.[0]?.message?.content?.trim();
        if (piece) console.log(`[Punct][LLM] chunk ${idx+1}/${parts.length} ok: in=${part.length} out=${piece.length}`);
        results[idx] = piece || part;
      } catch (e) {
        console.warn(`[Punct][LLM] chunk ${idx+1}/${parts.length} error:`, (e as Error).message);
        results[idx] = part;
      }
    };

    // run in batches with limited concurrency
    let i = 0;
    while (i < parts.length) {
      const batch = [] as Promise<void>[];
      for (let k = 0; k < concurrency && i + k < parts.length; k++) {
        batch.push(doOne(i + k));
      }
      await Promise.all(batch);
      i += concurrency;
      if (i < parts.length && batchDelayMs > 0) await new Promise(r => setTimeout(r, batchDelayMs));
    }

    const outAll = results.join('');
    return outAll || text;
  } catch {
    console.warn('[Punct][LLM] unexpected error, falling back to local');
    return null;
  }
}
