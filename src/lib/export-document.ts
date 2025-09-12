/**
 * Document Export Service
 * Exports transcriptions to Word and PDF formats with table of contents
 */

import { BasicChapter } from './basic-segmentation';
import { TranscriptionSegment } from './replicate';

export interface ExportOptions {
  format: 'docx' | 'pdf';
  includeTimestamps: boolean;
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
  ): Promise<Blob> {
    // Dynamic import to reduce bundle size
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType, TableOfContents } = await import('docx');
    
    const doc = new Document({
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
          new Paragraph({
            text: 'Full Transcription',
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 400 }
          }),
          
          // Content by chapters or flat
          ...(chapters.length > 0 && options.includeChapters !== false ? 
            await this.generateChapterContent(chapters, options.includeTimestamps !== false) :
            await this.generateFlatContent(transcription, options.includeTimestamps !== false)
          )
        ]
      }]
    });
    
    // In Node (API routes), prefer toBuffer for reliability.
    if (typeof window === 'undefined') {
      const buffer = await Packer.toBuffer(doc);
      return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    } else {
      const blob = await Packer.toBlob(doc);
      return blob;
    }
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
  ): Promise<Blob> {
    // Use jsPDF for PDF generation
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    let yPosition = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margins = { left: 20, right: 20, top: 20, bottom: 20 };
    const contentWidth = pageWidth - margins.left - margins.right;
    
    // Helper function to add text with automatic page breaks
    const addText = (text: string, fontSize: number = 12, isBold: boolean = false) => {
      doc.setFontSize(fontSize);
      if (isBold) {
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setFont('helvetica', 'normal');
      }
      
      const lines = doc.splitTextToSize(text, contentWidth);
      
      for (const line of lines) {
        if (yPosition > pageHeight - margins.bottom) {
          doc.addPage();
          yPosition = margins.top;
        }
        doc.text(line, margins.left, yPosition);
        yPosition += fontSize * 0.4;
      }
      yPosition += 5;
    };
    
    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(options.metadata?.title || 'Transcription Document', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;
    
    // Metadata
    if (options.metadata) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
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
    addText('Full Transcription', 18, true);
    yPosition += 5;
    
    // Content
    if (chapters.length > 0 && options.includeChapters !== false) {
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
            const segmentText = options.includeTimestamps !== false ?
              `[${this.formatTime(segment.start)}] ${segment.text}` :
              segment.text;
            addText(segmentText, 11, false);
          });
        }
        yPosition += 5;
      });
    } else {
      // Flat content
      if (transcription.segments && options.includeTimestamps !== false) {
        transcription.segments.forEach(segment => {
          const segmentText = `[${this.formatTime(segment.start)}] ${segment.text}`;
          addText(segmentText, 11, false);
        });
      } else {
        addText(transcription.text, 11, false);
      }
    }
    
    return doc.output('blob');
  }
  
  /**
   * Generate chapter content for Word document
   */
  private static async generateChapterContent(chapters: BasicChapter[], includeTimestamps: boolean, includeSpeakers: boolean = true): Promise<any[]> {
    const { Paragraph, TextRun, HeadingLevel } = await import('docx');
    const content: any[] = [];
    
    chapters.forEach((chapter, idx) => {
      // Chapter heading
      content.push(
        new Paragraph({
          text: `Chapter ${idx + 1}: ${chapter.title}`,
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
                  new TextRun({
                    text: `${speakerPrefix}${segment.text}`
                  })
                ],
                spacing: { after: 150 }
              })
            );
          } else {
            content.push(
              new Paragraph({
                text: `${speakerPrefix}${segment.text}`,
                spacing: { after: 150 }
              })
            );
          }
        });
      } else {
        // If chapter has no segments, add a note
        content.push(
          new Paragraph({
            text: '(No segments in this chapter)',
            italics: true,
            color: '999999',
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
                new TextRun({
                  text: segment.text
                })
              ],
              spacing: { after: 150 }
            })
          );
        });
      } else {
        // Without timestamps, just add segment text
        transcription.segments.forEach((segment: TranscriptionSegment) => {
          content.push(
            new Paragraph({
              text: segment.text,
              spacing: { after: 150 }
            })
          );
        });
      }
    } else if (transcription.text) {
      // Fall back to plain text if no segments
      transcription.text.split('\n').forEach((paragraph: string) => {
        if (paragraph.trim()) {
          content.push(
            new Paragraph({
              text: paragraph,
              spacing: { after: 200 }
            })
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
