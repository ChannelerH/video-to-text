import { NextRequest, NextResponse } from "next/server";
import { getTranscription, deleteTranscription } from "@/models/transcription";
import { getUserUuid } from "@/services/user";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const { job } = await params;
  const data = await getTranscription(job, user_uuid);
  if (!data) return NextResponse.json({ success:false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const { job } = await params;
  await deleteTranscription(job, user_uuid);
  return NextResponse.json({ success: true });
}
