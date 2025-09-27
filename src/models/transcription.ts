import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { transcription_results, transcriptions } from "@/db/schema";

export type SourceType = "youtube_url" | "audio_url" | "file_upload";

export async function createOrReuseTranscription(params: {
  job_id: string;
  user_uuid?: string;
  source_type: SourceType;
  source_hash: string;
  source_url?: string;
  title?: string;
  language?: string;
  duration_sec: number;
  original_duration_sec?: number;
  cost_minutes?: number;
  status?: string;
}) {
  const now = new Date();

  // DISABLED CACHING - Always create new transcription
  // // Try to find an existing completed job for the same source AND same user (avoid cross-user reuse)
  // const existing = await db()
  //   .select()
  //   .from(transcriptions)
  //   .where(and(
  //     eq(transcriptions.source_type as any, params.source_type),
  //     eq(transcriptions.source_hash, params.source_hash),
  //     eq(transcriptions.deleted, false as any),
  //     eq(transcriptions.status as any, "completed"),
  //     eq(transcriptions.user_uuid, params.user_uuid || "")
  //   ))
  //   .orderBy(desc(transcriptions.completed_at))
  //   .limit(1);

  // if (existing.length > 0) {
  //   return existing[0];
  // }

  const [row] = await db().insert(transcriptions).values({
    job_id: params.job_id,
    user_uuid: params.user_uuid || "",
    source_type: params.source_type,
    source_hash: params.source_hash,
    source_url: params.source_url,
    title: params.title,
    language: params.language,
    duration_sec: Math.round(params.duration_sec || 0),
    original_duration_sec: Math.round(params.original_duration_sec || params.duration_sec || 0),
    cost_minutes: ((params.cost_minutes ?? (params.duration_sec / 60)) as number).toFixed(3),
    status: params.status || "completed",
    created_at: now,
    completed_at: now,
  }).returning();

  return row;
}

export async function upsertTranscriptionFormats(job_id: string, formats: Record<string, string>) {
  const entries = Object.entries(formats).filter(([, v]) => !!v) as [string, string][];
  const now = new Date();

  for (const [fmt, content] of entries) {
    const size = Buffer.byteLength(content, "utf8");
    // Insert or update on conflict
    try {
      await db().insert(transcription_results).values({
        job_id,
        format: fmt,
        content,
        size_bytes: size,
        created_at: now,
      });
    } catch {
      await db().update(transcription_results)
        .set({ content, size_bytes: size, created_at: now })
        .where(and(eq(transcription_results.job_id, job_id), eq(transcription_results.format, fmt)));
    }
  }
}

export async function listUserTranscriptions(user_uuid: string, limit = 20, offset = 0, q?: string) {
  const base = db().select({
    job_id: transcriptions.job_id,
    source_type: transcriptions.source_type,
    source_hash: transcriptions.source_hash,
    source_url: transcriptions.source_url,
    title: transcriptions.title,
    language: transcriptions.language,
    duration_sec: transcriptions.duration_sec,
    created_at: transcriptions.created_at,
    completed_at: transcriptions.completed_at,
  })
  .from(transcriptions)
  .where(and(
    eq(transcriptions.user_uuid, user_uuid), 
    eq(transcriptions.deleted, false as any),
    q ? sql`(${transcriptions.title} ILIKE ${'%' + q + '%'} OR ${transcriptions.source_url} ILIKE ${'%' + q + '%'})` : sql`true`
  ))
  .orderBy(desc(transcriptions.completed_at))
  .limit(limit)
  .offset(offset);

  return base;
}

export async function getTranscription(job_id: string, user_uuid?: string) {
  const where = user_uuid
    ? and(eq(transcriptions.job_id, job_id), eq(transcriptions.user_uuid, user_uuid), eq(transcriptions.deleted, false as any))
    : eq(transcriptions.job_id, job_id);
  const [job] = await db().select().from(transcriptions).where(where as any).limit(1);
  if (!job) return null;
  const rows = await db().select().from(transcription_results).where(eq(transcription_results.job_id, job_id));
  const formats: Record<string, string> = {};
  rows.forEach((r: any) => { formats[r.format] = r.content; });
  return { job, formats };
}

export async function deleteTranscription(job_id: string, user_uuid?: string) {
  if (user_uuid) {
    await db().update(transcriptions)
      .set({ deleted: true })
      .where(and(eq(transcriptions.job_id, job_id), eq(transcriptions.user_uuid, user_uuid)));
  } else {
    await db().update(transcriptions)
      .set({ deleted: true })
      .where(eq(transcriptions.job_id, job_id));
  }
}

export async function countUserTranscriptions(user_uuid: string, q?: string) {
  const [row]: any = await db().execute(sql`
    SELECT COUNT(*)::int AS cnt FROM ${transcriptions}
    WHERE ${transcriptions.user_uuid} = ${user_uuid}
      AND ${transcriptions.deleted} = false
      ${q ? sql`AND (${transcriptions.title} ILIKE ${'%' + q + '%'} OR ${transcriptions.source_url} ILIKE ${'%' + q + '%'})` : sql``}
  `);
  return row?.cnt ?? 0;
}
