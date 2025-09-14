import { NextRequest, NextResponse } from "next/server";
import { getTranscription } from "@/models/transcription";
import { getUserUuid } from "@/services/user";
import { UnifiedTranscriptionService } from "@/lib/unified-transcription";
import { upsertTranscriptionFormats } from "@/models/transcription";
import { getUserTier, UserTier } from "@/services/user-tier";
import { POLICY, trimSegmentsToSeconds } from "@/services/policy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'txt').toLowerCase();
  const { job } = await params;
  const transcriptionData = (await getTranscription(job, user_uuid)) || ({} as any);
  const { job: jobData, formats } = transcriptionData;
  if (!jobData) return NextResponse.json({ success:false, error: 'not_found' }, { status: 404 });
  let content = formats?.[format];
  // 动态补齐缺失格式：优先用 JSON 结果再转换
  if (!content && formats?.json) {
    try {
      const service = new UnifiedTranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);
      const data = JSON.parse(formats.json);
      if (format === 'srt') content = service.convertToSRT(data);
      else if (format === 'vtt') content = service.convertToVTT(data);
      else if (format === 'txt') content = service.convertToPlainText(data);
      else if (format === 'md') content = service.convertToMarkdown(data, jobData?.title || job);

      // 异步持久化补齐的格式，方便下次直接下载
      if (content && content.length > 0) {
        upsertTranscriptionFormats(job, { [format]: content }).catch(() => {});
      }
    } catch {
      // ignore parse/convert errors; will fall through to 404
    }
  }
  if (!content && !formats?.json) return NextResponse.json({ success:false, error: 'format_not_found' }, { status: 404 });

  // FREE: 强制样例导出（前 5 分钟），统一在这里拦截所有格式
  const tier = await getUserTier(user_uuid);
  if (tier === UserTier.FREE) {
    try {
      const service = new UnifiedTranscriptionService(process.env.REPLICATE_API_TOKEN || '', process.env.DEEPGRAM_API_KEY);
      // 优先使用 JSON 数据以保证准确截断
      if (formats?.json) {
        const full = JSON.parse(formats.json || '{}');
        const maxSec = POLICY.preview.freePreviewSeconds || 300;
        // 去除说话人元数据，避免免费样例泄露完整话者结构
        const short = {
          ...full,
          segments: trimSegmentsToSeconds(full.segments || [], maxSec).map((s: any) => {
            const { speaker, ...rest } = s || {};
            return { ...rest };
          }),
          duration: Math.min(full.duration || maxSec, maxSec)
        };
        if (format === 'json') {
          content = JSON.stringify(short, null, 2);
        } else if (format === 'srt') {
          content = service.convertToSRT(short);
        } else if (format === 'vtt') {
          content = service.convertToVTT(short);
        } else if (format === 'txt') {
          content = service.convertToPlainText(short);
        } else if (format === 'md') {
          content = service.convertToMarkdown(short, jobData?.title || job);
        } else {
          // unknown: return plain text fallback
          content = service.convertToPlainText(short);
        }
      } else if (content) {
        // 无 JSON 仅有内容字符串：对 SRT/VTT 做行级截断，其他格式返回前若干字符作为兜底
        const maxSec = POLICY.preview.freePreviewSeconds || 300;
        if (format === 'srt') {
          const blocks = String(content).split(/\n\n+/);
          const kept: string[] = [];
          for (const b of blocks) {
            const lines = b.split(/\n/);
            const timeLine = lines.find(l => l.includes('-->')) || '';
            const endMatch = timeLine.match(/-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})/);
            let keep = true;
            if (endMatch) {
              const [hh, mm, ss] = endMatch[1].split(':').map(Number);
              const endSec = hh * 3600 + mm * 60 + ss;
              keep = endSec <= maxSec;
            }
            if (keep) kept.push(b);
          }
          content = kept.join('\n\n');
        } else if (format === 'vtt') {
          const lines = String(content).split(/\n/);
          const out: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            const m = ln.match(/(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})/);
            if (m) {
              const [hh, mm, ss] = m[3].split(':').map(Number);
              const endSec = hh * 3600 + mm * 60 + ss;
              if (endSec > maxSec) break;
            }
            out.push(ln);
          }
          content = out.join('\n');
        } else if (format === 'txt' || format === 'md' || format === 'json') {
          // 简单兜底：截断到前 5000 字符，避免大量泄露
          const str = String(content);
          content = str.length > 5000 ? str.slice(0, 5000) + '\n\n[Preview only — upgrade to unlock full export]\n' : str;
        }
      }
    } catch (e) {
      // 如果失败，继续返回原内容（已经在上面兜底了）
    }
  }

  const filename = `${jobData.title || jobData.job_id}.${format}`;
  const typeMap: Record<string,string> = {
    txt: 'text/plain; charset=utf-8',
    srt: 'application/x-subrip',
    vtt: 'text/vtt; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8'
  };
  return new NextResponse(content, {
    headers: {
      'Content-Type': typeMap[format] || 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }
  });
}
