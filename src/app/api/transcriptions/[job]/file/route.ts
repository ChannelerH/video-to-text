import { NextRequest, NextResponse } from "next/server";
import { getTranscription } from "@/models/transcription";
import { getUserUuid } from "@/services/user";

export async function GET(req: NextRequest, { params }: { params: { job: string } }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'txt').toLowerCase();
  const { job, formats } = (await getTranscription(params.job)) || ({} as any);
  if (!job) return NextResponse.json({ success:false, error: 'not_found' }, { status: 404 });
  const content = formats?.[format];
  if (!content) return NextResponse.json({ success:false, error: 'format_not_found' }, { status: 404 });

  const filename = `${job.title || job.job_id}.${format}`;
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }
  });
}

