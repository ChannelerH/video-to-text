import { db } from '@/db';
import { user_minutes } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

type PackType = 'standard' | 'high_accuracy';

interface MinutePack {
  id: number;
  user_id: string;
  pack_type: PackType;
  minutes_total: number;
  minutes_left: number;
  created_at: Date;
  expires_at: Date | null;
  order_no?: string;
}

async function getActivePacks(userId: string, packType: PackType): Promise<MinutePack[]> {
  const rows = await db().execute(sql`SELECT * FROM v2tx_minute_packs WHERE user_id = ${userId} AND pack_type = ${packType} AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY expires_at NULLS LAST, created_at ASC`);
  return (rows as any).rows || [];
}

async function insertPack(userId: string, packType: PackType, minutes: number, expiresAt?: Date, orderNo?: string) {
  // Check if pack with this order_no already exists (prevent duplicates from webhook + redirect)
  if (orderNo) {
    const existing = await db().execute(sql`SELECT id FROM v2tx_minute_packs WHERE order_no = ${orderNo} AND pack_type = ${packType} LIMIT 1`);
    if ((existing as any).rows?.length > 0) {
      return;
    }
  }
  
  await db().execute(sql`INSERT INTO v2tx_minute_packs(user_id, pack_type, minutes_total, minutes_left, created_at, expires_at, order_no) VALUES (${userId}, ${packType}, ${Math.ceil(minutes)}, ${Math.ceil(minutes)}, NOW(), ${expiresAt || null}, ${orderNo || ''})`);
}

export async function getMinuteBalances(userId: string): Promise<{ std: number; ha: number }> {
  // Sum from active packs to reflect real-time balance
  const std = await db().execute(sql`SELECT COALESCE(SUM(minutes_left),0) AS sum FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='standard' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`);
  const ha = await db().execute(sql`SELECT COALESCE(SUM(minutes_left),0) AS sum FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='high_accuracy' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`);
  const stdVal = Number((std as any).rows?.[0]?.sum || 0);
  const haVal = Number((ha as any).rows?.[0]?.sum || 0);
  // keep aggregated table updated best-effort
  const now = new Date();
  const [row] = await db().select().from(user_minutes).where(eq(user_minutes.user_id, userId));
  if (!row) {
    await db().insert(user_minutes).values({ user_id: userId, std_balance: stdVal, ha_balance: haVal, updated_at: now });
  } else {
    await db().update(user_minutes).set({ std_balance: stdVal, ha_balance: haVal, updated_at: now }).where(eq(user_minutes.user_id, userId));
  }
  return { std: stdVal, ha: haVal };
}

export async function addMinutes(userId: string, stdAdd: number = 0, haAdd: number = 0): Promise<void> {
  const now = new Date();
  // Create per-pack entries with 12 months validity
  const exp = new Date(now.getTime());
  exp.setMonth(exp.getMonth() + 12);
  if (stdAdd > 0) await insertPack(userId, 'standard', stdAdd, exp);
  if (haAdd > 0) await insertPack(userId, 'high_accuracy', haAdd, exp);
  // Update aggregate
  await getMinuteBalances(userId);
}

// Grant minutes with custom validity months (fallback to 12)
export async function addMinutesWithExpiry(userId: string, stdAdd: number = 0, haAdd: number = 0, validMonths?: number, orderNo?: string): Promise<void> {
  const now = new Date();
  const months = Math.max(1, Number(validMonths || 12));
  const exp = new Date(now.getTime());
  exp.setMonth(exp.getMonth() + months);
  if (stdAdd > 0) await insertPack(userId, 'standard', stdAdd, exp, orderNo);
  if (haAdd > 0) await insertPack(userId, 'high_accuracy', haAdd, exp, orderNo);
  await getMinuteBalances(userId);
}

// Deduct pack minutes first; returns remaining minutes that should count into monthly quota
export async function deductFromPacks(userId: string, minutes: number, modelType: 'standard' | 'high_accuracy'): Promise<number> {
  let remain = Math.max(0, Math.ceil(minutes));
  if (remain <= 0) return 0;
  const packs = await getActivePacks(userId, modelType);
  for (const p of packs) {
    if (remain <= 0) break;
    const use = Math.min(p.minutes_left, remain);
    if (use > 0) {
      await db().execute(sql`UPDATE v2tx_minute_packs SET minutes_left = minutes_left - ${use} WHERE id = ${p.id}`);
      remain -= use;
    }
  }
  // Update aggregate
  await getMinuteBalances(userId);
  return remain;
}

export async function getEstimatedPackCoverage(userId: string, minutes: number, modelType: 'standard' | 'high_accuracy'): Promise<number> {
  const rows = await db().execute(sql`SELECT COALESCE(SUM(minutes_left),0) AS sum FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type=${modelType} AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`);
  const pack = Number((rows as any).rows?.[0]?.sum || 0);
  const need = Math.max(0, Math.ceil(minutes));
  return Math.min(need, pack);
}

export async function getMinuteSummary(userId: string): Promise<{
  std: number;
  ha: number;
  stdEarliestExpire?: string | null;
  haEarliestExpire?: string | null;
  stdPacks: number;
  haPacks: number;
}> {
  const [stdSum, haSum, stdFirst, haFirst, stdCount, haCount] = await Promise.all([
    db().execute(sql`SELECT COALESCE(SUM(minutes_left),0) AS sum FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='standard' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`),
    db().execute(sql`SELECT COALESCE(SUM(minutes_left),0) AS sum FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='high_accuracy' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`),
    db().execute(sql`SELECT MIN(expires_at) AS exp FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='standard' AND (expires_at IS NOT NULL AND expires_at > NOW())`),
    db().execute(sql`SELECT MIN(expires_at) AS exp FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='high_accuracy' AND (expires_at IS NOT NULL AND expires_at > NOW())`),
    db().execute(sql`SELECT COUNT(*) AS cnt FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='standard' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`),
    db().execute(sql`SELECT COUNT(*) AS cnt FROM v2tx_minute_packs WHERE user_id=${userId} AND pack_type='high_accuracy' AND minutes_left > 0 AND (expires_at IS NULL OR expires_at > NOW())`),
  ]);
  const std = Number((stdSum as any).rows?.[0]?.sum || 0);
  const ha = Number((haSum as any).rows?.[0]?.sum || 0);
  const stdEarliestExpire = (stdFirst as any).rows?.[0]?.exp || null;
  const haEarliestExpire = (haFirst as any).rows?.[0]?.exp || null;
  const stdPacks = Number((stdCount as any).rows?.[0]?.cnt || 0);
  const haPacks = Number((haCount as any).rows?.[0]?.cnt || 0);
  return { std, ha, stdEarliestExpire, haEarliestExpire, stdPacks, haPacks };
}
