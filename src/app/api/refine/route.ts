import { NextRequest, NextResponse } from 'next/server';

// Simple guard: only allow short texts to avoid high costs; chunking can be added if needed
const MAX_CHARS = 8000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, language = 'auto' } = body || {};
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing text' }, { status: 400 });
    }
    const trimmed = String(text).slice(0, MAX_CHARS);

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY; // allow OpenAI‑compatible keys
    const apiBase = process.env.DEEPSEEK_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat';

    if (!apiKey) {
      // Not configured: return original text so UI still works
      return NextResponse.json({ success: true, text: trimmed });
    }

    // Build a precise prompt: restore punctuation and sentence boundaries, keep wording
    const system = 'You are a strict copy editor. Restore proper punctuation and sentence boundaries. Only adjust punctuation, line breaks, and CJK/Latin spacing. Do not translate; do not add or remove words.';
    const user = `Language: ${language}\nRules:\n- If Chinese: use Chinese punctuation（，。！？；：、“”‘’）; remove extra spaces inside Chinese; add spaces between Chinese and Latin/number; add missing commas/periods based on natural syntax; keep names and numbers.\n- If not Chinese, keep original punctuation (light cleanup only).\n- Return plain text only.\n\nText:\n${trimmed}`;

    // OpenAI‑compatible chat completions
    console.log(`[API/refine] calling LLM provider base=${apiBase} model=${model}`);
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
        max_tokens: 4096,
      })
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return NextResponse.json({ success: false, error: `Refine API error: ${resp.status} ${txt}` }, { status: 502 });
    }
    const data = await resp.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) {
      return NextResponse.json({ success: true, text: trimmed });
    }
    return NextResponse.json({ success: true, text: out });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
