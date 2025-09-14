import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { q_jobs } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

function globalCap(): number { return Number(process.env.Q_CAP_TOTAL || 4); }
function tierPriority(t: string): number { const x=(t||'').toLowerCase(); if (x==='pro'||x==='premium') return 3; if (x==='basic') return 2; return 1; }

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  // Global stats
  const [runningRow] = await db().select({ c: sql<number>`COUNT(*)` }).from(q_jobs).where(and(sql`picked_at IS NOT NULL`, eq(q_jobs.done, false)));
  const [waitingRow] = await db().select({ c: sql<number>`COUNT(*)` }).from(q_jobs).where(and(sql`picked_at IS NULL`, eq(q_jobs.done, false)));
  const cap = globalCap();

  // Per-tier waiting counts
  const tiers = ['free','basic','pro'];
  const perTier = [] as any[];
  for (const t of tiers) {
    const [w] = await db().select({ c: sql<number>`COUNT(*)` }).from(q_jobs).where(and(eq(q_jobs.tier, t), sql`picked_at IS NULL`, eq(q_jobs.done, false)));
    perTier.push({ tier: t, waiting: Number(w?.c || 0) });
  }

  // Optional: compute a job's position and estimated wait
  const jobId = req.nextUrl.searchParams.get('jobId');
  let positionInfo: any = null;
  if (jobId) {
    const [me] = await db().select().from(q_jobs).where(eq(q_jobs.job_id, jobId));
    if (me && !me.done) {
      const myPr = tierPriority(me.tier);
      const [posRow] = await db().select({ pos: sql<number>`COUNT(*)` }).from(q_jobs).where(and(
        eq(q_jobs.done, false),
        sql`picked_at IS NULL`,
        sql`( (CASE WHEN ${q_jobs.tier} IN ('pro','premium') THEN 3 WHEN ${q_jobs.tier}='basic' THEN 2 ELSE 1 END) > ${myPr}
              OR ( (CASE WHEN ${q_jobs.tier} IN ('pro','premium') THEN 3 WHEN ${q_jobs.tier}='basic' THEN 2 ELSE 1 END) = ${myPr} AND (created_at < ${me.created_at} OR (created_at = ${me.created_at} AND job_id < ${me.job_id})) ) )`
      ));
      const position = Number(posRow?.pos || 0);
      const slotSec = Number(process.env.Q_SLOT_SEC || 60);
      const estWaitSec = Math.max(0, Math.ceil(position / Math.max(1, cap)) * slotSec);
      positionInfo = { jobId, tier: me.tier, position, running: Number(runningRow?.c || 0), cap, estWaitSec };
    }
  }

  return NextResponse.json({ success: true, data: { global: { cap, running: Number(runningRow?.c || 0), waiting: Number(waitingRow?.c || 0) }, perTier, position: positionInfo } });
}
