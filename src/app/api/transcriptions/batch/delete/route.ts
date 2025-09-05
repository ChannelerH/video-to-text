import { NextRequest, NextResponse } from "next/server";
import { getUserUuid } from "@/services/user";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) return NextResponse.json({ success:false, error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const ids: string[] = Array.isArray(body?.job_ids) ? body.job_ids : [];
  if (ids.length === 0) return NextResponse.json({ success:false, error: 'empty' }, { status: 400 });
  await db().update(transcriptions)
    .set({ deleted: true })
    .where(and(eq(transcriptions.user_uuid, user_uuid), inArray(transcriptions.job_id, ids)));
  return NextResponse.json({ success: true, count: ids.length });
}

