import { NextRequest, NextResponse } from "next/server";
import { getUserUuid } from "@/services/user";
import { db } from "@/db";
import { transcription_edits } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { readJson } from "@/lib/read-json";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const rows = await db()
    .select({ content: transcription_edits.content })
    .from(transcription_edits)
    .where(and(eq(transcription_edits.job_id, job), eq(transcription_edits.user_uuid, user_uuid)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ success: false, error: "not-found" }, { status: 404 });
  return NextResponse.json({ success: true, data: JSON.parse(rows[0].content) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const body = await readJson<Record<string, any>>(req);
  const content = JSON.stringify({ ...body, updatedAt: new Date().toISOString() });

  // upsert by job+user
  const existing = await db()
    .select({ id: transcription_edits.id })
    .from(transcription_edits)
    .where(and(eq(transcription_edits.job_id, job), eq(transcription_edits.user_uuid, user_uuid)))
    .limit(1);

  if (existing[0]) {
    await db()
      .update(transcription_edits)
      .set({ content, updated_at: new Date() })
      .where(eq(transcription_edits.id, existing[0].id));
  } else {
    await db()
      .insert(transcription_edits)
      .values({ job_id: job, user_uuid, content, created_at: new Date(), updated_at: new Date() });
  }

  return NextResponse.json({ success: true });
}
