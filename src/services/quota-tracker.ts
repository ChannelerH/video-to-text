import { db } from '@/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { usage_records } from '@/db/schema';
import { getUserUsageSummary } from './user-minutes';

interface UsageRecord {
  userId: string;
  date: string;
  requestCount: number;
  totalMinutes: number;
  modelType: string;
}

interface QuotaStatus {
  isAllowed: boolean;
  reason?: string;
  remaining: {
    dailyRequests: number;
    monthlyMinutes: number;
    monthlyHighAccuracyMinutes?: number;
  };
  usage: {
    dailyRequests: number;
    monthlyMinutes: number;
    monthlyHighAccuracyMinutes?: number;
  };
}

export class QuotaTracker {
  /**
   * 检查用户配额
   */
  async checkQuota(
    userId: string,
    userTier: string,
    requestDurationMinutes: number = 0,
    modelType: 'standard' | 'high_accuracy' = 'standard'
  ): Promise<QuotaStatus> {
    const quotaLimits = this.getQuotaLimits(userTier);
    const usage = await this.getUserUsage(userId);
    const usageSummary = await getUserUsageSummary(userId).catch(() => null);

    const dynamicMonthlyLimit = usageSummary
      ? usageSummary.isUnlimited
        ? Infinity
        : Math.max(quotaLimits.monthlyMinutes, Number(usageSummary.totalAvailable || 0))
      : quotaLimits.monthlyMinutes;

    const dynamicMonthlyUsed = usageSummary
      ? Number(usageSummary.totalUsed || usage.monthlyMinutes)
      : usage.monthlyMinutes;

    const normalizedUsage = {
      ...usage,
      monthlyMinutes: dynamicMonthlyUsed
    };

    const baseHaLimitRaw = quotaLimits.monthlyHighAccuracyMinutes;
    const highAccuracyLimit = baseHaLimitRaw === undefined ? 0 : baseHaLimitRaw;
    const currentHighAccuracyUsed = usage.monthlyHighAccuracyMinutes || 0;

    // 仅当“请求+分钟”都无限时才视为完全无限制
    if (quotaLimits.dailyRequests === Infinity && quotaLimits.monthlyMinutes === Infinity) {
      return {
        isAllowed: true,
        remaining: {
          dailyRequests: Infinity,
          monthlyMinutes: Infinity,
          monthlyHighAccuracyMinutes: Infinity
        },
        usage: {
          dailyRequests: usage.dailyRequests,
          monthlyMinutes: usage.monthlyMinutes,
          monthlyHighAccuracyMinutes: usage.monthlyHighAccuracyMinutes
        }
      };
    }

    // 检查每日请求限制
    if (usage.dailyRequests >= quotaLimits.dailyRequests) {
      return {
        isAllowed: false,
        reason: 'Daily request limit exceeded',
        remaining: {
          dailyRequests: 0,
          monthlyMinutes: dynamicMonthlyLimit === Infinity
            ? Infinity
            : Math.max(0, dynamicMonthlyLimit - dynamicMonthlyUsed),
          monthlyHighAccuracyMinutes: baseHaLimitRaw === Infinity
            ? Infinity
            : Math.max(0, highAccuracyLimit - currentHighAccuracyUsed)
        },
        usage: normalizedUsage
      };
    }

    // 检查月度时长限制（标准分钟）
    if (dynamicMonthlyLimit !== Infinity && (dynamicMonthlyUsed + requestDurationMinutes > dynamicMonthlyLimit)) {
      return {
        isAllowed: false,
        reason: 'Monthly minutes quota exceeded',
        remaining: {
          dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
          monthlyMinutes: 0,
          monthlyHighAccuracyMinutes: baseHaLimitRaw === Infinity
            ? Infinity
            : Math.max(0, highAccuracyLimit - currentHighAccuracyUsed)
        },
        usage: normalizedUsage
      };
    }

    // 检查高精度分钟池（仅 PRO 且 high_accuracy 模式）
    if (modelType === 'high_accuracy' && baseHaLimitRaw) {
      if (baseHaLimitRaw !== Infinity && (currentHighAccuracyUsed + requestDurationMinutes > highAccuracyLimit)) {
        return {
          isAllowed: false,
          reason: 'High-accuracy minutes quota exceeded',
          remaining: {
            dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
            monthlyMinutes: dynamicMonthlyLimit === Infinity
              ? Infinity
              : Math.max(0, dynamicMonthlyLimit - dynamicMonthlyUsed),
            monthlyHighAccuracyMinutes: 0
          },
          usage: normalizedUsage
        };
      }
    }

    return {
      isAllowed: true,
      remaining: {
        dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
        monthlyMinutes: dynamicMonthlyLimit === Infinity
          ? Infinity
          : Math.max(0, dynamicMonthlyLimit - dynamicMonthlyUsed - requestDurationMinutes),
        monthlyHighAccuracyMinutes: baseHaLimitRaw === Infinity
          ? Infinity
          : Math.max(0, highAccuracyLimit - currentHighAccuracyUsed - (modelType === 'high_accuracy' ? requestDurationMinutes : 0))
      },
      usage: normalizedUsage
    };
  }

  /**
   * 记录使用情况
   */
  async recordUsage(
    userId: string,
    durationMinutes: number,
    modelType: string,
    subscriptionType?: string
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const payload: any = {
        user_id: userId,
        date: today,
        minutes: durationMinutes,
        model_type: modelType,
        created_at: new Date()
      };

      if (subscriptionType) {
        payload.subscription_type = subscriptionType;
      }

      try {
        await db().insert(usage_records).values(payload);
      } catch (e) {
        // fallback: ignore duplicate or table missing
        console.log(`Recording usage for ${userId}: ${durationMinutes} minutes with ${modelType}`, e);
      }
    } catch (error) {
      console.error('Failed to record usage:', error);
    }
  }


  /**
   * 获取用户使用情况
   */
  private async getUserUsage(userId: string): Promise<{
    dailyRequests: number;
    monthlyMinutes: number;
    monthlyHighAccuracyMinutes: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    try {
      const [daily] = await db().select({
        count: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} NOT LIKE 'pack_%' THEN 1 ELSE 0 END),0)`,
        minutes: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} NOT LIKE 'pack_%' THEN ${usage_records.minutes} ELSE 0 END),0)`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), eq(usage_records.date, today)));

      const [monthly] = await db().select({
        minutes: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} NOT LIKE 'pack_%' THEN ${usage_records.minutes} ELSE 0 END),0)`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), gte(usage_records.created_at, monthStart)));

      const [monthlyHA] = await db().select({
        minutes: sql<number>`COALESCE(SUM(CASE WHEN ${usage_records.model_type} = 'high_accuracy' THEN ${usage_records.minutes} ELSE 0 END),0)`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), gte(usage_records.created_at, monthStart)));

      return {
        dailyRequests: daily?.count || 0,
        monthlyMinutes: monthly?.minutes || 0,
        monthlyHighAccuracyMinutes: monthlyHA?.minutes || 0
      };
    } catch {
      return { dailyRequests: 0, monthlyMinutes: 0, monthlyHighAccuracyMinutes: 0 };
    }
  }

  /**
   * 获取配额限制
   */
  private getQuotaLimits(userTier: string): {
    dailyRequests: number;
    monthlyMinutes: number;
    monthlyHighAccuracyMinutes?: number;
  } {
    switch (userTier) {
      case 'premium':
        return {
          dailyRequests: Infinity,
          monthlyMinutes: Infinity,
          monthlyHighAccuracyMinutes: Infinity
        };
      case 'pro':
        return {
          dailyRequests: 200,
          monthlyMinutes: 2000,
          monthlyHighAccuracyMinutes: 200
        };
      case 'basic':
        return {
          dailyRequests: 50,
          monthlyMinutes: 500
        };
      case 'free':
      default:
        return {
          dailyRequests: Infinity,  // Remove daily limit for better UX
          monthlyMinutes: 30        // Increase to 30 minutes for more trials
        };
    }
  }

  /**
   * 重置用户每日配额（定时任务）
   */
  async resetDailyQuotas(): Promise<void> {
    // 每日凌晨重置
    console.log('Resetting daily quotas...');
  }

  /**
   * 获取配额统计
   */
  async getQuotaStats(userId: string): Promise<{
    tier: string;
    limits: any;
    usage: any;
    resetDate: Date;
  }> {
    // 获取用户等级和使用统计
    const userTier = 'free'; // 实际应从数据库获取
    const limits = this.getQuotaLimits(userTier);
    const usage = await this.getUserUsage(userId);
    
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);

    return {
      tier: userTier,
      limits,
      usage,
      resetDate
    };
  }
}

// 导出单例
export const quotaTracker = new QuotaTracker();
