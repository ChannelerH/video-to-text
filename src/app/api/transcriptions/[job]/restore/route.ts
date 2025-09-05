import { NextRequest, NextResponse } from "next/server";
import { getUserUuid } from "@/services/user";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const { job } = await params;
  await db().update(transcriptions)
    .set({ deleted: false })
    .where(and(eq(transcriptions.job_id, job), eq(transcriptions.user_uuid, user_uuid)));
  return NextResponse.json({ success: true });
}

