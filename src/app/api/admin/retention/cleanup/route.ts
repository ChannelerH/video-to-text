import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions, transcription_results, transcription_edits } from '@/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { getUserTier, UserTier } from '@/services/user-tier';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

const ADMIN_HEADER = 'x-admin-secret';

export async function POST(req: NextRequest) {
  const secret = req.headers.get(ADMIN_HEADER) || req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  // Fetch a window of records to avoid long transactions (batch 500)
  const limit = Number(req.nextUrl.searchParams.get('limit') || 500);
  const olderThanDays = Number(req.nextUrl.searchParams.get('older') || 0); // optional force

  // Scan transcriptions table in small batches
  const all = await db().select().from(transcriptions).limit(limit);

  let deleted = 0;
  for (const row of all) {
    try {
      const tier = await getUserTier(row.user_uuid || '');
      const retentionDays = tier === UserTier.PRO ? 365 : tier === UserTier.BASIC ? 90 : 14;
      const cutoffDays = olderThanDays > 0 ? olderThanDays : retentionDays;
      const cutoff = daysAgo(cutoffDays);
      const created = row.created_at ? new Date(row.created_at as any) : new Date();
      if (created < cutoff) {
        // Hard-delete related rows
        await db().delete(transcription_results).where(eq(transcription_results.job_id, row.job_id));
        await db().delete(transcription_edits).where(and(eq(transcription_edits.job_id, row.job_id), eq(transcription_edits.user_uuid, row.user_uuid)));
        await db().delete(transcriptions).where(eq(transcriptions.id, row.id));
        deleted++;
      }
    } catch (e) {
      // Continue best-effort
    }
  }

  return NextResponse.json({ success: true, deleted });
}

