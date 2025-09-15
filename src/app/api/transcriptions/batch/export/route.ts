import { NextRequest } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { transcriptions, transcription_results } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { buildZip } from '@/lib/zip';
import { getUserTier, UserTier } from '@/services/user-tier';
import { POLICY, trimSegmentsToSeconds } from '@/services/policy';
import { UnifiedTranscriptionService } from '@/lib/unified-transcription';

export async function POST(req: NextRequest) {
  try {
    const user_uuid = await getUserUuid();
    if (!user_uuid) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    const job_ids: string[] = body?.job_ids || [];
    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'invalid job_ids' }), { status: 400 });
    }

    // Fetch jobs for this user
    const rows = await db()
      .select({ job_id: transcriptions.job_id, title: transcriptions.title, duration_sec: transcriptions.duration_sec })
      .from(transcriptions)
      .where(and(eq(transcriptions.user_uuid, user_uuid), inArray(transcriptions.job_id, job_ids)));

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'not_found' }), { status: 404 });
    }

    // Load formats for each job
    const entries: { name: string; data: Uint8Array }[] = [];
    const tier = await getUserTier(user_uuid);
    const service = new UnifiedTranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);

    for (const job of rows) {
      const res = await db().select().from(transcription_results).where(eq(transcription_results.job_id, job.job_id));
      const map: Record<string, string> = {};
      res.forEach((r: any) => { map[r.format] = r.content; });

      let formats = map;

      // FREE: export only allowed formats and only first 5 minutes
      if (tier === UserTier.FREE) {
        try {
          const maxSec = POLICY.preview.freePreviewSeconds || 300;
          if (formats.json) {
            const parsed = JSON.parse(formats.json || '[]');
            // 兼容两种形态：segments 数组 或 带 segments 的对象
            const segments = Array.isArray(parsed) ? parsed : (parsed.segments || []);
            const language = Array.isArray(parsed) ? undefined : parsed.language;
            const short = {
              text: '',
              segments: trimSegmentsToSeconds(segments, maxSec),
              language: language || 'unknown',
              duration: maxSec
            } as any;
            // 仅保留 TXT/SRT/VTT（FREE 不导出 JSON/MD）
            formats = {
              txt: service.convertToPlainText(short),
              srt: service.convertToSRT(short),
              vtt: service.convertToVTT(short)
            } as any;
          } else if (formats.txt) {
            const str = String(formats.txt);
            formats.txt = str.length > 5000 ? str.slice(0, 5000) + '\n\n[Preview only — upgrade to unlock full export]\n' : str;
          }
        } catch {}
      }

      // Add available formats to zip under job folder
      const base = (job.title || job.job_id).replace(/\s+/g, '_');
      const keys = tier === UserTier.FREE ? ['txt', 'srt', 'vtt'] : ['txt', 'srt', 'vtt', 'json', 'md'];
      for (const key of keys) {
        const content = formats[key];
        if (!content) continue;
        entries.push({ name: `${base}/${base}.${key}`, data: new TextEncoder().encode(content) });
      }
    }

    if (entries.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'no_formats' }), { status: 404 });
    }

    const zip = buildZip(entries);
    const fname = `transcriptions_${new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]}.zip`;
    return new Response(zip, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`
      }
    });
  } catch (e) {
    console.error('Batch export error:', e);
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), { status: 500 });
  }
}
