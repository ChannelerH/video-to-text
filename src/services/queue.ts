import { db } from '@/db';
import { q_jobs } from '@/db/schema';
import { and, count, eq, gte, lt, sql, or } from 'drizzle-orm';
import crypto from 'crypto';

// Minimal priority queue: single global cap + per-tier priority
function getGlobalCapacity(): number {
  return Number(process.env.Q_CAP_TOTAL || 4);
}

function tierPriority(tier: string): number {
  const t = (tier || '').toLowerCase();
  if (t === 'pro' || t === 'premium') return 3;
  if (t === 'basic') return 2;
  return 1; // free/default
}

export async function enqueueJob(tier: string, userId: string): Promise<{ jobId: string; createdAt: Date }>{
  const jobId = crypto.randomBytes(8).toString('hex');
  const createdAt = new Date();
  await db().insert(q_jobs).values({ job_id: jobId, tier, user_id: userId, created_at: createdAt }).catch(() => {});
  return { jobId, createdAt };
}

export async function waitForTurn(tier: string, jobId: string, createdAt: Date, timeoutMs: number = 120000): Promise<{ picked: boolean; position?: number }>{
  const start = Date.now();
  const cap = getGlobalCapacity();
  while (Date.now() - start < timeoutMs) {
    // count running globally
    const [runningRow] = await db().select({ running: sql<number>`COUNT(*)` }).from(q_jobs).where(and(sql`picked_at IS NOT NULL`, eq(q_jobs.done, false)));
    const running = Number(runningRow?.running || 0);

    // my priority/position among all pending (higher tier first, then FIFO)
    const myPr = tierPriority(tier);
    const [posRow] = await db().select({ pos: sql<number>`COUNT(*)` }).from(q_jobs).where(and(
      eq(q_jobs.done, false),
      sql`( (CASE WHEN ${q_jobs.tier} IN ('pro','premium') THEN 3 WHEN ${q_jobs.tier}='basic' THEN 2 ELSE 1 END) > ${myPr}
            OR ( (CASE WHEN ${q_jobs.tier} IN ('pro','premium') THEN 3 WHEN ${q_jobs.tier}='basic' THEN 2 ELSE 1 END) = ${myPr} AND (created_at < ${createdAt} OR (created_at = ${createdAt} AND job_id < ${jobId})) ) )`
    ));
    const position = Number(posRow?.pos || 0);

    if (running < cap && position === 0) {
      // pick (ignore tier filter for picking)
      await db().update(q_jobs).set({ picked_at: new Date() }).where(and(eq(q_jobs.job_id, jobId), eq(q_jobs.done, false)));
      return { picked: true };
    }

    // small sleep
    await new Promise(r => setTimeout(r, 300));
  }
  return { picked: false };
}

export async function markDone(jobId: string): Promise<void> {
  await db().update(q_jobs).set({ done: true }).where(eq(q_jobs.job_id, jobId));
}

export async function cleanupQueue(hours: number = 24): Promise<void> {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  await db().delete(q_jobs).where(and(eq(q_jobs.done, true), lt(q_jobs.created_at, cutoff)));
}
