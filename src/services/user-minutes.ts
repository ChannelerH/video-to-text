import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { eq, and, gte, sql, or, isNull } from 'drizzle-orm';
import { getMinuteSummary } from './minutes';
import { getUserActiveSubscriptions } from './user-tier';

export async function getUserTotalMinutes(userUuid: string): Promise<{
  subscriptions: Array<{ type: string; minutes: number; expiresAt: Date | null }>;
  packs: number; // remaining pack minutes
  packAllowance: number; // total pack minutes purchased (active)
  total: number;
  isUnlimited: boolean;
}> {
  if (!userUuid) {
    return {
      subscriptions: [],
      packs: 0,
      packAllowance: 0,
      total: 30,
      isUnlimited: false
    };
  }

  try {
    // 1. 获取所有活跃订阅
    const activeSubscriptions = await getUserActiveSubscriptions(userUuid);
    
    // 2. 计算每个订阅的分钟数
    const subscriptionDetails = activeSubscriptions.map(sub => {
      const minutesFromOrder = typeof sub.credits === 'number' ? sub.credits : null;
      const minutes =
        minutesFromOrder !== null && minutesFromOrder !== undefined && minutesFromOrder !== 0
          ? minutesFromOrder
          : 0;
      return {
        type: sub.type,
        minutes,
        expiresAt: sub.expiresAt
      };
    });

    let subscriptionAllowance = 0;
    let isUnlimited = false;
    for (const sub of subscriptionDetails) {
      if (sub.minutes === -1) {
        isUnlimited = true;
        subscriptionAllowance = -1;
        break;
      }
      subscriptionAllowance += sub.minutes;
    }

    const packSummary = await getMinuteSummary(userUuid);
    const packMinutesRemaining = Number(packSummary.std || 0);
    const packAllowance = Number((packSummary as any).stdTotal || packMinutesRemaining);

    let baseAllowance = 0;
    if (!isUnlimited && subscriptionAllowance === 0) {
      baseAllowance = 30;
    }

    const total = isUnlimited ? -1 : baseAllowance + subscriptionAllowance + packAllowance;

    return {
      subscriptions: subscriptionDetails,
      packs: packMinutesRemaining,
      packAllowance,
      total,
      isUnlimited
    };
  } catch (error) {
    console.error('Error calculating total minutes:', error);
    return {
      subscriptions: [],
      packs: 0,
      packAllowance: 0,
      total: 30,
      isUnlimited: false
    };
  }
}

/**
 * 获取用户当前周期的使用量
 */
export async function getUserMinutesUsed(userUuid: string): Promise<number> {
  if (!userUuid) return 0;
  
  try {
    // 计算本月使用量（从月初开始）
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    
    // 优先从 usage_records 表获取
    const [usageResult] = await db()
      .select({ 
        total: sql<number>`COALESCE(SUM(${usage_records.minutes}::double precision), 0)` 
      })
      .from(usage_records)
      .where(
        and(
          eq(usage_records.user_id, userUuid),
          gte(usage_records.created_at, firstDayOfMonth)
        )
      );
    
    return Number(usageResult?.total || 0);
  } catch (error) {
    console.error('Error getting minutes used:', error);
    return 0;
  }
}

/**
 * 获取用户完整的使用情况汇总
 */
export async function getUserUsageSummary(userUuid: string) {
  const [totalMinutes, usedMinutes] = await Promise.all([
    getUserTotalMinutes(userUuid),
    getUserMinutesUsed(userUuid)
  ]);
  
  const remaining = totalMinutes.isUnlimited ? -1 : 
                   Math.max(0, totalMinutes.total - usedMinutes);
  
  return {
    // 订阅部分
    subscriptions: totalMinutes.subscriptions,
    subscriptionTotal: totalMinutes.subscriptions.reduce((sum, s) => 
      s.minutes === -1 ? -1 : (sum === -1 ? -1 : sum + s.minutes), 0
    ),
    
    // 分钟包部分
    packMinutes: totalMinutes.packs,
    packAllowance: totalMinutes.packAllowance,

    // 使用情况
    totalAvailable: totalMinutes.total,
    totalUsed: usedMinutes,
    remaining,
    isUnlimited: totalMinutes.isUnlimited,
    
    // 百分比
    percentageUsed: totalMinutes.isUnlimited ? 0 : 
                   totalMinutes.total > 0 ? (usedMinutes / totalMinutes.total) * 100 : 0
  };
}

/**
 * 记录分钟数使用
 */
export async function recordMinutesUsage(
  userUuid: string,
  minutes: number,
  modelType: 'standard' | 'high_accuracy' = 'standard',
  subscriptionType?: string
): Promise<void> {
  if (!userUuid || minutes <= 0) return;
  
  try {
    await db().insert(usage_records).values({
      user_id: userUuid,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      minutes: String(minutes),
      model_type: modelType,
      created_at: new Date(),
      subscription_type: subscriptionType
    });
  } catch (error) {
    console.error('Error recording usage:', error);
  }
}

/**
 * 检查用户是否有足够的分钟数
 */
export async function checkMinutesAvailable(
  userUuid: string, 
  requiredMinutes: number
): Promise<{
  canProceed: boolean;
  reason?: string;
  available: number;
  required: number;
}> {
  const usage = await getUserUsageSummary(userUuid);
  
  if (usage.isUnlimited) {
    return {
      canProceed: true,
      available: -1,
      required: requiredMinutes
    };
  }
  
  const canProceed = usage.remaining >= requiredMinutes;
  
  return {
    canProceed,
    reason: canProceed ? undefined : 
            `需要 ${requiredMinutes} 分钟，但只剩余 ${usage.remaining} 分钟`,
    available: usage.remaining,
    required: requiredMinutes
  };
}
