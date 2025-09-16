import { NextRequest } from "next/server";
import { getUserUuid } from "@/services/user";
import { db } from "@/db";
import { transcriptions, transcription_results, transcription_edits } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { DocumentExportService } from "@/lib/export-document";
import { getUserTier, UserTier } from "@/services/user-tier";
import { POLICY, trimSegmentsToSeconds } from "@/services/policy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401 });
  const { job } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'docx').toLowerCase();
  const includeChapters = (url.searchParams.get('includeChapters') ?? '1') !== '0';
  const includeTimestamps = (url.searchParams.get('includeTimestamps') ?? '1') !== '0';
  const includeSpeakers = (url.searchParams.get('includeSpeakers') ?? '1') !== '0';
  if (!['docx','pdf'].includes(format)) return new Response('invalid-format', { status: 400 });

  // fetch transcription json
  const [trow] = await db().select().from(transcriptions).where(and(eq(transcriptions.job_id, job), eq(transcriptions.user_uuid, user_uuid))).limit(1);
  if (!trow) return new Response('not-found', { status: 404 });
  const [jsonRow] = await db().select({ content: transcription_results.content }).from(transcription_results).where(and(eq(transcription_results.job_id, job), eq(transcription_results.format, 'json'))).limit(1);
  if (!jsonRow) return new Response('no-json', { status: 404 });
  const parsed = JSON.parse(jsonRow.content || '[]');
  const segments = Array.isArray(parsed) ? parsed : (parsed.segments || []);
  const lang = (Array.isArray(parsed) ? (trow as any).language : (parsed.language || (trow as any).language));

  // fetch edits if any
  const [editRow] = await db().select({ content: transcription_edits.content }).from(transcription_edits).where(and(eq(transcription_edits.job_id, job), eq(transcription_edits.user_uuid, user_uuid))).limit(1);
  const edited = editRow ? JSON.parse(editRow.content) : null;
  
  // Use edited segments if available, otherwise use original
  let finalSegments = edited?.segments || segments;
  let chapters = edited?.chapters || [];
  const summary = edited?.summary || '';
  
  // If no chapters exist, create a default one with all segments
  if ((!chapters || chapters.length === 0) && finalSegments.length > 0) {
    chapters = [{
      id: 'default',
      title: 'Full Transcription',
      startTime: finalSegments[0]?.start || 0,
      endTime: finalSegments[finalSegments.length - 1]?.end || trow.duration_sec || 60,
      segments: finalSegments
    }];
  }

  const meta = {
    title: trow.title || job,
    date: new Date(trow.created_at || Date.now()).toISOString().slice(0,10),
    language: lang,
    duration: trow.duration_sec
  };

  // Rebuild full text from edited segments
  const editedText = finalSegments.map((s: any) => s.text).join(' ');
  
  // Ensure chapters have proper segments
  let finalChapters = chapters.map((chapter: any) => {
    // Always rebuild segments to ensure correct assignment
    // A segment belongs to a chapter if its start time is within the chapter's range
    const chapterSegments = finalSegments.filter((seg: any) => 
      seg.start >= chapter.startTime && seg.start < chapter.endTime
    );
    return { ...chapter, segments: chapterSegments };
  });

  // Enforce FREE export as preview-only (first 5 minutes)
  const tier = await getUserTier(user_uuid);
  if (tier === UserTier.FREE) {
    const maxSec = POLICY.preview.freePreviewSeconds;
    finalSegments = trimSegmentsToSeconds(finalSegments, maxSec);
    finalChapters = finalChapters.map((c: any) => ({
      ...c,
      segments: trimSegmentsToSeconds(c.segments || [], maxSec),
      endTime: Math.min(c.endTime, maxSec)
    }));
  }
  
  // Debug logging
  console.log('Export Debug:', {
    job,
    hasEditRow: !!editRow,
    originalSegmentsCount: segments.length,
    finalSegmentsCount: finalSegments.length,
    chaptersBeforeRebuild: chapters.length,
    chaptersAfterRebuild: finalChapters.length,
    firstChapterSegments: finalChapters[0]?.segments?.length || 0,
    textLength: editedText.length,
    includeChapters,
    includeTimestamps,
    firstSegmentSample: finalSegments[0],
    firstChapterSample: finalChapters[0]
  });
  
  // If chapters exist, don't pass segments to avoid duplication
  const transcriptionData = finalChapters.length > 0 
    ? { text: editedText, language: lang, duration: trow.duration_sec }
    : { text: editedText, segments: finalSegments, language: lang, duration: trow.duration_sec };
  
  const resultData = format === 'docx'
    ? await DocumentExportService.exportToWord(
        transcriptionData,
        finalChapters,
        summary,
        { includeChapters, includeTimestamps, includeSpeakers: tier !== UserTier.FREE, metadata: meta }
      )
    : await DocumentExportService.exportToPDF(
        transcriptionData,
        finalChapters,
        summary,
        { includeChapters, includeTimestamps, includeSpeakers: tier !== UserTier.FREE, metadata: meta }
      );

  // Normalize to Buffer
  let outBuf: Buffer;
  if (typeof (resultData as any)?.arrayBuffer === 'function') {
    const ab = await (resultData as Blob).arrayBuffer();
    outBuf = Buffer.from(new Uint8Array(ab));
  } else if (resultData instanceof ArrayBuffer) {
    outBuf = Buffer.from(new Uint8Array(resultData));
  } else {
    // Assume Node Buffer
    outBuf = resultData as unknown as Buffer;
  }
  // Use original filename for file uploads, title for URLs  
  const baseName = trow.source_type === 'file_upload' && trow.title
    ? trow.title.replace(/\.[^/.]+$/, '') // Remove extension if exists
    : (trow.title || 'transcription');
  const fname = `${baseName.replace(/\s+/g,'_')}.${format}`;
  return new Response(outBuf, {
    headers: {
      'Content-Type': format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'Cache-Control': 'no-store'
    }
  });
}
export const runtime = 'nodejs';
