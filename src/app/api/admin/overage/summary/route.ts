import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { and, gte, lt, sql } from 'drizzle-orm';

function parseMonth(input?: string | null): { start: Date; end: Date } {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-based
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split('-').map((v) => Number(v));
    if (!Number.isNaN(y) && !Number.isNaN(m) && m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
    }
  }
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  return { start, end };
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const monthParam = req.nextUrl.searchParams.get('month'); // YYYY-MM
  const { start, end } = parseMonth(monthParam);
  const centsPerMin = Number(process.env.OVERAGE_CENTS_PER_MINUTE || 5);

  // Aggregate per user
  const rows = await db().select({
    user_id: usage_records.user_id,
    std: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} = 'standard' THEN ${usage_records.minutes} ELSE 0 END),0)`,
    ha: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} = 'high_accuracy' THEN ${usage_records.minutes} ELSE 0 END),0)`,
    over: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} = 'overage_high_accuracy' THEN ${usage_records.minutes} ELSE 0 END),0)`,
  }).from(usage_records)
    .where(and(gte(usage_records.created_at, start), lt(usage_records.created_at, end)))
    .groupBy(usage_records.user_id);

  const items = rows.map((r) => ({
    userId: r.user_id,
    standardMinutes: Number(r.std || 0),
    highAccuracyMinutes: Number(r.ha || 0),
    overageMinutes: Number(r.over || 0),
    estimatedChargeCents: Number(r.over || 0) * centsPerMin
  }));

  const total = items.reduce((acc, it) => {
    acc.standardMinutes += it.standardMinutes;
    acc.highAccuracyMinutes += it.highAccuracyMinutes;
    acc.overageMinutes += it.overageMinutes;
    acc.estimatedChargeCents += it.estimatedChargeCents;
    return acc;
  }, { standardMinutes: 0, highAccuracyMinutes: 0, overageMinutes: 0, estimatedChargeCents: 0 });

  return NextResponse.json({ success: true, data: { month: monthParam || 'current', items, total, centsPerMin } });
}

