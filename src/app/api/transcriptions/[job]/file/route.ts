import { NextRequest, NextResponse } from "next/server";
import { getTranscription } from "@/models/transcription";
import { getUserUuid } from "@/services/user";

export async function GET(req: NextRequest, { params }: { params: { job: string } }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'txt').toLowerCase();
  const { job, formats } = (await getTranscription(params.job, user_uuid)) || ({} as any);
  if (!job) return NextResponse.json({ success:false, error: 'not_found' }, { status: 404 });
  const content = formats?.[format];
  if (!content) return NextResponse.json({ success:false, error: 'format_not_found' }, { status: 404 });

  const filename = `${job.title || job.job_id}.${format}`;
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
