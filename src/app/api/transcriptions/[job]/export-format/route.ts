import { NextRequest } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { transcriptions, transcription_results } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUserTier, UserTier } from '@/services/user-tier';
import { POLICY, trimSegmentsToSeconds } from '@/services/policy';
import { UnifiedTranscriptionService } from '@/lib/unified-transcription';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const { job: job_id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const format = searchParams.get('format');
    
    if (!format || !['txt', 'srt', 'vtt', 'json', 'md'].includes(format)) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_format' }), { status: 400 });
    }

    const user_uuid = await getUserUuid();
    if (!user_uuid) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401 });
    }

    // Verify ownership
    const job = await db()
      .select({ 
        job_id: transcriptions.job_id, 
        title: transcriptions.title, 
        duration_sec: transcriptions.duration_sec 
      })
      .from(transcriptions)
      .where(and(
        eq(transcriptions.user_uuid, user_uuid), 
        eq(transcriptions.job_id, job_id)
      ))
      .then(rows => rows[0]);

    if (!job) {
      return new Response(JSON.stringify({ success: false, error: 'not_found' }), { status: 404 });
    }

    // Load transcription results
    const results = await db()
      .select()
      .from(transcription_results)
      .where(eq(transcription_results.job_id, job_id));
    
    const formats: Record<string, string> = {};
    results.forEach((r: any) => { 
      formats[r.format] = r.content; 
    });

    // Check user tier for preview limitations
    const tier = await getUserTier(user_uuid);
    const service = new UnifiedTranscriptionService(
      process.env.REPLICATE_API_TOKEN || '', 
      process.env.DEEPGRAM_API_KEY
    );

    let exportContent = formats[format];

    // Apply FREE tier limitations
    if (tier === UserTier.FREE) {
      try {
        const maxSec = POLICY.preview.freePreviewSeconds || 300;
        if (formats.json) {
          const full = JSON.parse(formats.json);
          const trimmed = {
            ...full,
            segments: trimSegmentsToSeconds(full.segments || [], maxSec),
            duration: Math.min(full.duration || maxSec, maxSec)
          };
          
          // Generate the requested format from trimmed data
          switch (format) {
            case 'txt':
              exportContent = service.convertToPlainText(trimmed);
              break;
            case 'srt':
              exportContent = service.convertToSRT(trimmed);
              break;
            case 'vtt':
              exportContent = service.convertToVTT(trimmed);
              break;
            case 'md':
              exportContent = service.convertToMarkdown(trimmed, job.title || job.job_id);
              break;
            case 'json':
              exportContent = JSON.stringify(trimmed, null, 2);
              break;
          }
        } else if (format === 'txt' && formats.txt) {
          // Fallback for txt if json not available
          const str = String(formats.txt);
          exportContent = str.length > 5000 
            ? str.slice(0, 5000) + '\n\n[Preview only — upgrade to unlock full export]\n' 
            : str;
        }
      } catch (e) {
        console.error('Error processing preview:', e);
      }
    }

    if (!exportContent) {
      return new Response(JSON.stringify({ success: false, error: 'format_not_available' }), { status: 404 });
    }

    // Set appropriate content type and filename
    const filename = `${(job.title || job.job_id).replace(/\s+/g, '_')}.${format}`;
    const contentType = format === 'json' ? 'application/json' : 'text/plain';

    return new Response(exportContent, {
      headers: {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (e) {
    console.error('Export error:', e);
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), { status: 500 });
  }
}