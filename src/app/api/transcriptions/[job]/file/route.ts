import { NextRequest, NextResponse } from "next/server";
import { getTranscription } from "@/models/transcription";
import { getUserUuid } from "@/services/user";
import { UnifiedTranscriptionService } from "@/lib/unified-transcription";
import { upsertTranscriptionFormats } from "@/models/transcription";

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
  if (!content) return NextResponse.json({ success:false, error: 'format_not_found' }, { status: 404 });

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
