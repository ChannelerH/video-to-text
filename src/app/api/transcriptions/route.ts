import { NextRequest, NextResponse } from "next/server";
import { getUserUuid } from "@/services/user";
import { countUserTranscriptions, listUserTranscriptions } from "@/models/transcription";

export async function GET(req: NextRequest) {
  const user_uuid = await getUserUuid();
  if (!user_uuid) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
  const q = url.searchParams.get("q") || undefined;
  const rows = await listUserTranscriptions(user_uuid, limit, offset, q);
  const total = await countUserTranscriptions(user_uuid, q);
  return NextResponse.json({ success: true, data: rows, total, limit, offset });
}
