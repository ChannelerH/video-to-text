import { NextRequest, NextResponse } from 'next/server';

// Use puppeteer-core with @sparticuz/chromium for serverless-friendly PDF export
// This route renders an HTML document to PDF to correctly support complex scripts (Indic/RTL/CJK).

export const maxDuration = 15;

type Segment = { start: number; end: number; text: string; speaker?: string };
type Chapter = { title: string; startTime: number; endTime: number; segments?: Segment[] };

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Remove zero-width chars, control chars, normalize to NFC
function sanitize(input: string): string {
  let s = String(input || '');
  // remove zero-width (ZWJ/ZWNJ/BOM)
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // remove ASCII control chars except tab/newline (keep "\n" for paragraphs)
  s = s.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');
  // remove Unicode line/paragraph separators that can break shaping
  s = s.replace(/[\u2028\u2029]/g, '\n');
  // collapse weird spacing
  s = s.replace(/[\t\r]+/g, ' ');
  try { s = s.normalize('NFC'); } catch {}
  return s;
}

function buildHtml(params: {
  title: string;
  language?: string;
  duration?: number;
  summary?: string;
  chapters?: Chapter[];
  text?: string;
  includeChapters?: boolean;
  includeTimestamps?: boolean;
}) {
  const { title, language, duration, summary, chapters = [], text = '', includeChapters = true, includeTimestamps = true } = params;
  // Include broad Noto font coverage for complex scripts
  // Note: Chromium does shaping; @font-face is for consistent glyphs across platforms
  const fonts = [
    'https://fonts.googleapis.com/css2?family=Noto+Sans&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Lao&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+JP&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+SC&display=swap'
  ];

  const serializedSummary = sanitize(summary || '').split('\n').map(s => `<p>${escapeHtml(s)}</p>`).join('');

  const chapterHtml = includeChapters && chapters.length > 0
    ? chapters.map((ch, idx) => `
      <h2>Chapter ${idx + 1}: ${escapeHtml(sanitize(ch.title))}</h2>
      <p class="meta">[${formatTime(ch.startTime)} - ${formatTime(ch.endTime)}]</p>
      ${Array.isArray(ch.segments) ? ch.segments.map(seg => `
        <p>${includeTimestamps ? `<span class="ts">[${formatTime(seg.start)}]</span> ` : ''}${escapeHtml(sanitize(seg.text || ''))}</p>
      `).join('') : ''}
    `).join('')
    : `<h2>Full Transcription</h2>${sanitize(text).split('\n').map(p => `<p>${escapeHtml(p)}</p>`).join('')}`;

  return `<!doctype html>
  <html lang="${language || 'en'}">
  <head>
    <meta charset="utf-8" />
    ${fonts.map(href => `<link rel="stylesheet" href="${href}">`).join('\n')}
    <style>
      html, body { margin: 0; padding: 0; }
      body { font-family: 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', 'Noto Sans Gurmukhi', 'Noto Sans Gujarati', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Sinhala', 'Noto Sans Arabic', 'Noto Sans Hebrew', 'Noto Sans Thai', 'Noto Sans Lao', 'Noto Sans Khmer', 'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR', sans-serif; font-size: 12pt; line-height: 1.5; color: #111; }
      .container { padding: 28px 36px; }
      h1 { font-size: 22pt; margin: 0 0 8px; }
      h2 { font-size: 16pt; margin: 18px 0 6px; color: #0b61c7; }
      .meta { color: #666; font-size: 10pt; margin: 0 0 8px; }
      .ts { color: #0b61c7; font-weight: 600; }
      p { margin: 6px 0; word-break: break-word; }
      .summary-title { font-size: 18pt; margin-top: 12px; }
    </style>
  </head>
  <body>
    <div class="container" dir="auto">
      <h1>${escapeHtml(sanitize(title || 'Transcription Document'))}</h1>
      <p class="meta">${language ? `Language: ${escapeHtml(sanitize(language))}` : ''} ${typeof duration === 'number' ? ` · Duration: ${formatTime(duration)}` : ''}</p>
      ${summary ? `<h2 class="summary-title">Summary</h2>${serializedSummary}` : ''}
      ${chapterHtml}
    </div>
  </body>
  </html>`;
}

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.ENABLE_SERVER_PDF === 'false') {
      return NextResponse.json({ error: 'server_pdf_disabled' }, { status: 503 });
    }

    const body = await req.json();
    const { title, language, duration, summary, chapters, text, includeChapters, includeTimestamps } = body || {};

    // Lazy import chromium + puppeteer-core to reduce cold start
    const chromium = await import('@sparticuz/chromium');
    const puppeteer = await import('puppeteer-core');

    const html = buildHtml({ title, language, duration, summary, chapters, text, includeChapters, includeTimestamps });

    const executablePath = await chromium.executablePath;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' } });
    await browser.close();

    return new NextResponse(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="transcription.pdf"' } });
  } catch (error) {
    console.error('[Export PDF] error:', error);
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }
}
