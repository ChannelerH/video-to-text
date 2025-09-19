/**
 * Document Export Service
 * Exports transcriptions to Word and PDF formats with table of contents
 */

import { BasicChapter } from './basic-segmentation';
import { TranscriptionSegment } from './replicate';

export interface ExportOptions {
  format: 'docx' | 'pdf';
  includeTimestamps: boolean;
  includeSpeakers?: boolean;
  includeChapters: boolean;
  includeSummary: boolean;
  metadata?: {
    title?: string;
    author?: string;
    date?: string;
    language?: string;
    duration?: number;
  };
}

export class DocumentExportService {
  /**
   * Export transcription to Word document (.docx)
   */
  static async exportToWord(
    transcription: {
      text: string;
      segments?: TranscriptionSegment[];
      language?: string;
      duration?: number;
    },
    chapters: BasicChapter[] = [],
    summary: string = '',
    options: Partial<ExportOptions> = {}
  ): Promise<Blob | ArrayBuffer | Buffer> {
    // Dynamic import to reduce bundle size
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType, TableOfContents } = await import('docx');

    // Detect Indic scripts for Word export as well (fonts are not embedded in DOCX by default)
    const hasIndicDocx = (s: string) => /[\u0900-\u0DFF]/.test(s);
    const textPool = [
      options.metadata?.title || '',
      transcription.text || '',
      ...(transcription.segments || []).map(s => s.text)
    ].join('\n');
    const useIndicFont = hasIndicDocx(textPool);
    // Prefer a broad-coverage Indic UI font on Windows; Word will fallback appropriately on other OS
    const defaultIndicFont = 'Nirmala UI'; // covers many Indic scripts on Windows
    
    const doc = new Document({
      styles: useIndicFont ? {
        default: {
          document: {
            run: { font: defaultIndicFont }
          }
        }
      } : undefined,
      sections: [{
        properties: {},
        children: [
          // Title Page
          new Paragraph({
            text: options.metadata?.title || 'Transcription Document',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          
          // Metadata
          ...(options.metadata ? [
            new Paragraph({
              children: [
                new TextRun({ text: 'Date: ', bold: true }),
                new TextRun(options.metadata.date || new Date().toLocaleDateString())
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Language: ', bold: true }),
                new TextRun(transcription.language || 'Unknown')
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Duration: ', bold: true }),
                new TextRun(this.formatDuration(transcription.duration || 0))
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 }
            })
          ] : []),
          
          // Summary Section
          ...(summary && options.includeSummary !== false ? [
            new PageBreak(),
            new Paragraph({
              text: 'Summary',
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 }
            }),
            ...summary.split('\n').map(line => 
              new Paragraph({
                text: line,
                spacing: { after: 200 }
              })
            )
          ] : []),
          
          // Main Content
          new PageBreak(),
          
          // Content by chapters or flat
          ...(chapters.length > 0 && options.includeChapters !== false ? [
            // If chapters exist, show them directly without "Full Transcription" header
            ...(await this.generateChapterContent(chapters, options.includeTimestamps !== false, options.includeSpeakers !== false))
          ] : [
            // Only show "Full Transcription" if there are no chapters
            new Paragraph({
              text: 'Full Transcription',
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 }
            }),
            ...(await this.generateFlatContent(transcription, options.includeTimestamps !== false))
          ])
        ]
      }]
    });
    
    // In Node (API routes), return raw Buffer/ArrayBuffer for maximum compatibility
    if (typeof window === 'undefined') {
      const buffer = await Packer.toBuffer(doc);
      // Some Node runtimes (<=18) may not have global Blob; return Buffer directly
      return buffer as unknown as Buffer;
    }
    // Browser: return Blob
    const blob = await Packer.toBlob(doc);
    return blob;
  }
  
  /**
   * Export transcription to PDF
   */
  static async exportToPDF(
    transcription: {
      text: string;
      segments?: TranscriptionSegment[];
      language?: string;
      duration?: number;
    },
    chapters: BasicChapter[] = [],
    summary: string = '',
    options: Partial<ExportOptions> = {}
  ): Promise<Blob | ArrayBuffer | Buffer> {
    // Smart routing: for complex scripts, prefer server-side Chromium HTML->PDF if enabled
    const hasArabic = (s: string) => /[\u0600-\u06FF\u0750-\u077F]/.test(s);
    const hasHebrew = (s: string) => /[\u0590-\u05FF]/.test(s);
    const hasThai = (s: string) => /[\u0E00-\u0E7F]/.test(s);
    const hasLao = (s: string) => /[\u0E80-\u0EFF]/.test(s);
    const hasMyanmar = (s: string) => /[\u1000-\u109F]/.test(s);
    const hasKhmer = (s: string) => /[\u1780-\u17FF]/.test(s);
    const hasIndic = (s: string) => /[\u0900-\u0DFF]/.test(s);
    const hasCJK = (s: string) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s);

    const combinedForDetect = [
      options.metadata?.title || '',
      transcription.text || '',
      ...(transcription.segments || []).map(s => s.text).join('\n'),
      ...(chapters || []).map(c => `${c.title} ${(c.segments||[]).map(s => s.text).join(' ')}`).join('\n')
    ].join('\n');
    const complex = hasArabic(combinedForDetect) || hasHebrew(combinedForDetect) || hasThai(combinedForDetect) || hasLao(combinedForDetect) || hasMyanmar(combinedForDetect) || hasKhmer(combinedForDetect) || hasIndic(combinedForDetect) || hasCJK(combinedForDetect);

    // If complex scripts detected, try server-export first (if running in browser)
    if (complex && typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_ENABLE_SERVER_PDF === 'true' || process.env.ENABLE_SERVER_PDF === 'true')) {
      try {
        const resp = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: options.metadata?.title || 'Transcription Document',
            language: transcription.language,
            duration: transcription.duration,
            summary,
            chapters: options.includeChapters !== false ? chapters : [],
            text: transcription.text,
            includeChapters: options.includeChapters !== false,
            includeTimestamps: options.includeTimestamps !== false
          })
        });
        if (resp.ok) {
          const blob = await resp.blob();
          return blob;
        }
      } catch (e) {
        try { console.warn('[PDF] server export failed, falling back to jsPDF:', e); } catch {}
      }
    }
    // Use jsPDF for PDF generation
    const { jsPDF } = await import('jspdf');
    
    // Helpers
    const toBase64 = (ab: ArrayBuffer): string => {
      if (typeof Buffer !== 'undefined') {
        // Node
        return Buffer.from(new Uint8Array(ab)).toString('base64');
      }
      // Browser
      let binary = '';
      const bytes = new Uint8Array(ab);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };
    const tryLoadCJKFont = async (): Promise<null | { name: string; file: string }> => {
      try {
        // Prefer local public font if present
        if (typeof window === 'undefined') {
          try {
            const { readFile } = await import('fs/promises');
            const pathCandidates = [
              `${process.cwd()}/public/fonts/NotoSansSC-Regular.ttf`,
              `${process.cwd()}/public/fonts/NotoSansSC-Regular.otf`
            ];
            for (const p of pathCandidates) {
              try {
                const buf = await readFile(p);
                return { name: p.endsWith('.otf') ? 'NotoSansSC-Regular.otf' : 'NotoSansSC-Regular.ttf', file: buf.toString('base64') };
              } catch {}
            }
          } catch {}
        } else {
          const localUrls = [
            '/fonts/NotoSansSC-Regular.ttf',
            '/fonts/NotoSansSC-Regular.otf'
          ];
          for (const url of localUrls) {
            try {
              const resp = await fetch(url);
              if (resp.ok) {
                const ab = await resp.arrayBuffer();
                return { name: url.endsWith('.otf') ? 'NotoSansSC-Regular.otf' : 'NotoSansSC-Regular.ttf', file: toBase64(ab) };
              }
            } catch {}
          }
        }
        // Fallback to CDN (prefer TTF for compatibility)
        const cdn = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/TTF/SimplifiedChinese/NotoSansSC-Regular.ttf';
        const resp = await fetch(cdn);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          return { name: 'NotoSansSC-Regular.ttf', file: toBase64(ab) };
        }
      } catch {}
      return null;
    };
    // Indic script detection (Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala)
    const pickIndicFontCdn = (s: string): { url: string; family: string } | null => {
      // Choose a suitable Noto font per script block
      if (/[\u0900-\u097F]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansdevanagari/NotoSansDevanagari-Regular.ttf', family: 'NotoSansDevanagari' };
      if (/[\u0980-\u09FF]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansbengali/NotoSansBengali-Regular.ttf', family: 'NotoSansBengali' };
      if (/[\u0A00-\u0A7F]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansgurmukhi/NotoSansGurmukhi-Regular.ttf', family: 'NotoSansGurmukhi' };
      if (/[\u0A80-\u0AFF]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansgujarati/NotoSansGujarati-Regular.ttf', family: 'NotoSansGujarati' };
      if (/[\u0B00-\u0B7F]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansoriya/NotoSansOriya-Regular.ttf', family: 'NotoSansOriya' };
      if (/[\u0B80-\u0BFF]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosanstamil/NotoSansTamil-Regular.ttf', family: 'NotoSansTamil' };
      if (/[\u0C00-\u0C7F]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosanstelugu/NotoSansTelugu-Regular.ttf', family: 'NotoSansTelugu' };
      if (/[\u0C80-\u0CFF]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosanskannada/NotoSansKannada-Regular.ttf', family: 'NotoSansKannada' };
      if (/[\u0D00-\u0D7F]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosansmalayalam/NotoSansMalayalam-Regular.ttf', family: 'NotoSansMalayalam' };
      if (/[\u0D80-\u0DFF]/.test(s)) return { url: 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/notosanssinhala/NotoSansSinhala-Regular.ttf', family: 'NotoSansSinhala' };
      return null;
    };

    const tryLoadIndicFont = async (sample: string): Promise<null | { name: string; family: string; file: string }> => {
      const pick = pickIndicFontCdn(sample);
      if (!pick) return null;
      const localName = `${pick.family}-Regular.ttf`;
      // 1) Prefer local font in public/fonts (Node runtime)
      if (typeof window === 'undefined') {
        try {
          const { readFile } = await import('fs/promises');
          const p = `${process.cwd()}/public/fonts/${localName}`;
          const buf = await readFile(p);
          return { name: localName, family: pick.family, file: buf.toString('base64') };
        } catch {}
      } else {
        // 2) Prefer local font via fetch in browser
        try {
          const respLocal = await fetch(`/fonts/${localName}`);
          if (respLocal.ok) {
            const ab = await respLocal.arrayBuffer();
            return { name: localName, family: pick.family, file: toBase64(ab) };
          }
        } catch {}
      }
      // 3) Fallback to CDN
      try {
        const resp = await fetch(pick.url);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          const file = toBase64(ab);
          const name = pick.url.split('/').pop() || localName;
          return { name, family: pick.family, file };
        }
      } catch {}
      return null;
    };

    // Determine if we need a CJK or Indic font
    const title = options.metadata?.title || 'Transcription Document';
    const combined = [
      title,
      transcription.text || '',
      (chapters || []).map(c => c.title).join('\n')
    ].join('\n');
    let cjkLoaded = false;
    let cjkFontName = 'NotoSansSC';
    let indicLoaded = false;
    let indicFontFamily = 'NotoSansDevanagari';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Try to load script fonts
    // CJK
    if (hasCJK(combined)) {
      try {
        const f = await tryLoadCJKFont();
        if (f) {
          (doc as any).addFileToVFS(f.name, f.file);
          (doc as any).addFont(f.name, cjkFontName, 'normal');
          doc.setFont(cjkFontName, 'normal');
          cjkLoaded = true;
        }
      } catch {}
    }
    // Indic
    if (!cjkLoaded && hasIndic(combined)) {
      try {
        const f = await tryLoadIndicFont(combined);
        if (f) {
          (doc as any).addFileToVFS(f.name, f.file);
          (doc as any).addFont(f.name, f.family, 'normal');
          doc.setFont(f.family, 'normal');
          indicLoaded = true;
          indicFontFamily = f.family;
        }
      } catch {}
    }
    try { console.log('[PDF] CJK detection:', { detected: hasCJK(combined), cjkLoaded, cjkFontName }); } catch {}
    try { console.log('[PDF] Indic detection:', { detected: hasIndic(combined), indicLoaded, indicFontFamily }); } catch {}
    
    let yPosition = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margins = { left: 20, right: 20, top: 20, bottom: 20 };
    const contentWidth = pageWidth - margins.left - margins.right;
    
    const includeSpeakers = options.includeSpeakers !== false;

    // Helper function to add text with automatic page breaks
    const addText = (text: string, fontSize: number = 12, isBold: boolean = false) => {
      // 1) 清洗文本：去控制符/零宽字符/特殊分隔符，并做 NFC 规范化
      const sanitizeLine = (s: string) => {
        let v = String(s || '');
        v = v
          .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '') // 控制符
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // 零宽/BOM
          .replace(/[\u2028\u2029]/g, '\\n') // 行/段落分隔符
          .replace(/\r\n/g, '\\n');
        try { v = v.normalize('NFC'); } catch {}
        return v;
      };
      const content = sanitizeLine(text);

      // 2) 字体与字号
      doc.setFontSize(fontSize);
      if (cjkLoaded) {
        doc.setFont(cjkFontName, 'normal');
      } else if (indicLoaded) {
        doc.setFont(indicFontFamily, 'normal');
      } else {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      }

      // 3) 自动换行（统一用 splitTextToSize；CJK 也能按宽度拆分）
      const lines = doc.splitTextToSize(content, contentWidth);

      // 4) 行距（适当加大，避免叠行）
      const lineHeight = Math.max(6, fontSize * 0.68);

      for (const line of lines) {
        if (yPosition > pageHeight - margins.bottom) {
          doc.addPage();
          yPosition = margins.top;
          // 新页需继续设置字体
          if (cjkLoaded) doc.setFont(cjkFontName, 'normal');
          else if (indicLoaded) doc.setFont(indicFontFamily, 'normal');
          else doc.setFont('helvetica', isBold ? 'bold' : 'normal');
          doc.setFontSize(fontSize);
        }
        doc.text(line, margins.left, yPosition);
        yPosition += lineHeight;
      }
      // 段后间距
      yPosition += Math.max(4, fontSize * 0.15);
    };

    const getSpeakerPrefix = (segment: any): string => {
      if (!includeSpeakers || !segment || !segment.speaker) return '';
      const raw = segment.speaker;
      const label = (typeof raw === 'string' && /^\d+$/.test(raw)) ? `Speaker ${parseInt(raw, 10) + 1}` : String(raw);
      return label ? `${label}: ` : '';
    };
    
    // Title (wrap and center)
    doc.setFontSize(24);
    if (cjkLoaded) doc.setFont(cjkFontName, 'normal');
    else if (indicLoaded) doc.setFont(indicFontFamily, 'normal');
    else doc.setFont('helvetica', 'bold');
    const safeTitle = ((): string => {
      try { return String(title || '').normalize('NFC').replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g,'').replace(/[\u200B-\u200D\uFEFF]/g,''); } catch { return String(title || ''); }
    })();
    const titleLines = doc.splitTextToSize(safeTitle, contentWidth);
    titleLines.forEach((line: string, idx: number) => {
      doc.text(line, pageWidth / 2, yPosition + idx * 9, { align: 'center' });
    });
    yPosition += Math.max(15, titleLines.length * 9 + 6);
    
    // Metadata
    if (options.metadata) {
      doc.setFontSize(12);
      if (cjkLoaded) doc.setFont(cjkFontName, 'normal');
      else if (indicLoaded) doc.setFont(indicFontFamily, 'normal');
      else doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${options.metadata.date || new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 7;
      doc.text(`Language: ${transcription.language || 'Unknown'}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 7;
      doc.text(`Duration: ${this.formatDuration(transcription.duration || 0)}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;
    }
    
    // Table of Contents
    // if (chapters.length > 0 && options.includeChapters !== false) {
    //   doc.addPage();
    //   yPosition = margins.top;
    //   addText('Table of Contents', 18, true);
    //   yPosition += 5;
      
    //   chapters.forEach((chapter, idx) => {
    //     const chapterLine = `${idx + 1}. ${chapter.title} (${this.formatTime(chapter.startTime)})`;
    //     addText(chapterLine, 12, false);
    //   });
    // }
    
    // Summary
    if (summary && options.includeSummary !== false) {
      doc.addPage();
      yPosition = margins.top;
      addText('Summary', 18, true);
      yPosition += 5;
      addText(summary, 12, false);
    }
    
    // Main Content
    doc.addPage();
    yPosition = margins.top;
    
    // Content
    if (chapters.length > 0 && options.includeChapters !== false) {
      // If chapters exist, don't add "Full Transcription" header
      chapters.forEach((chapter, idx) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage();
          yPosition = margins.top;
        }
        
        // Chapter title
        addText(`Chapter ${idx + 1}: ${chapter.title}`, 14, true);
        addText(`[${this.formatTime(chapter.startTime)} - ${this.formatTime(chapter.endTime)}]`, 10, false);
        yPosition += 3;
        
        // Chapter segments
        if (chapter.segments) {
          chapter.segments.forEach(segment => {
            const speakerPrefix = getSpeakerPrefix(segment);
            const segmentText = options.includeTimestamps !== false ?
              `[${this.formatTime(segment.start)}] ${speakerPrefix}${segment.text}` :
              `${speakerPrefix}${segment.text}`;
            addText(segmentText, 11, false);
          });
        }
        yPosition += 5;
      });
    } else {
      // Only show "Full Transcription" if there are no chapters
      addText('Full Transcription', 18, true);
      yPosition += 5;
      
      // Flat content
      if (transcription.segments && transcription.segments.length > 0) {
        transcription.segments.forEach(segment => {
          const speakerPrefix = getSpeakerPrefix(segment);
          const segmentText = options.includeTimestamps !== false ?
            `[${this.formatTime(segment.start)}] ${speakerPrefix}${segment.text}` :
            `${speakerPrefix}${segment.text}`;
          addText(segmentText, 11, false);
        });
      } else {
        addText(transcription.text, 11, false);
      }
    }
    
    // In Node (API routes), return ArrayBuffer/Buffer for maximum compatibility
    if (typeof window === 'undefined') {
      const arr = doc.output('arraybuffer') as ArrayBuffer;
      return arr;
    }
    return doc.output('blob') as Blob;
  }
  
  /**
   * Generate chapter content for Word document
   */
  private static async generateChapterContent(chapters: BasicChapter[], includeTimestamps: boolean, includeSpeakers: boolean = true): Promise<any[]> {
    const { Paragraph, TextRun, HeadingLevel } = await import('docx');
    const content: any[] = [];
    const clean = (s: string) => {
      let v = String(s || '');
      v = v.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g,'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\u2028\u2029]/g,'\n');
      try { v = v.normalize('NFC'); } catch {}
      return v;
    };
    
    chapters.forEach((chapter, idx) => {
      // Chapter heading
      content.push(
        new Paragraph({
          text: `Chapter ${idx + 1}: ${clean(chapter.title)}`,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        })
      );
      
      // Chapter time range
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${this.formatTime(chapter.startTime)} - ${this.formatTime(chapter.endTime)}]`,
              italics: true,
              color: '666666'
            })
          ],
          spacing: { after: 200 }
        })
      );
      
      // Chapter segments
      if (chapter.segments && chapter.segments.length > 0) {
        chapter.segments.forEach(segment => {
          let speakerPrefix = '';
          if (includeSpeakers && (segment as any).speaker) {
            const sp = (segment as any).speaker;
            const label = (typeof sp === 'string' && /^\d+$/.test(sp)) ? `Speaker ${parseInt(sp) + 1}` : String(sp);
            speakerPrefix = `${label}: `;
          }
          if (includeTimestamps) {
            content.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[${this.formatTime(segment.start)}] `,
                    bold: true,
                    color: '0066CC'
                  }),
                  new TextRun({ text: `${speakerPrefix}${clean(segment.text)}` })
                ],
                spacing: { after: 150 }
              })
            );
          } else {
            content.push(
              new Paragraph({
              text: `${speakerPrefix}${clean(segment.text)}`,
                spacing: { after: 150 }
              })
            );
          }
        });
      } else {
        // If chapter has no segments, add a note
        content.push(
          new Paragraph({
            children: [
              new TextRun({ text: '(No segments in this chapter)', italics: true, color: '999999' })
            ],
            spacing: { after: 150 }
          })
        );
      }
    });
    
    return content;
  }
  
  /**
   * Generate flat content for Word document
   */
  private static async generateFlatContent(transcription: any, includeTimestamps: boolean): Promise<any[]> {
    const { Paragraph, TextRun } = await import('docx');
    const content: any[] = [];
    const clean = (s: string) => {
      let v = String(s || '');
      v = v.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g,'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\u2028\u2029]/g,'\n');
      try { v = v.normalize('NFC'); } catch {}
      return v;
    };
    
    // Handle both segments array and text
    if (transcription.segments && transcription.segments.length > 0) {
      if (includeTimestamps) {
        transcription.segments.forEach((segment: TranscriptionSegment) => {
          content.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[${this.formatTime(segment.start)}] `,
                  bold: true,
                  color: '0066CC'
                }),
                new TextRun({ text: clean(segment.text) })
              ],
              spacing: { after: 150 }
            })
          );
        });
      } else {
        // Without timestamps, just add segment text
        transcription.segments.forEach((segment: TranscriptionSegment) => {
          content.push(
            new Paragraph({ text: clean(segment.text), spacing: { after: 150 } })
          );
        });
      }
    } else if (transcription.text) {
      // Fall back to plain text if no segments
      transcription.text.split('\n').forEach((paragraph: string) => {
        if (paragraph.trim()) {
          content.push(
            new Paragraph({ text: clean(paragraph), spacing: { after: 200 } })
          );
        }
      });
    }
    
    return content;
  }
  
  /**
   * Format time in MM:SS format
   */
  private static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Format duration in human-readable format
   */
  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}
