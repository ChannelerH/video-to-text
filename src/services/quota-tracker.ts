import { db } from '@/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { usage_records } from '@/db/schema';

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

    // 无限制用户
    if (quotaLimits.dailyRequests === Infinity) {
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
          monthlyMinutes: Math.max(0, quotaLimits.monthlyMinutes - usage.monthlyMinutes),
          monthlyHighAccuracyMinutes: Math.max(0, (quotaLimits.monthlyHighAccuracyMinutes || 0) - (usage.monthlyHighAccuracyMinutes || 0))
        },
        usage
      };
    }

    // 检查月度时长限制（标准分钟）
    if (usage.monthlyMinutes + requestDurationMinutes > quotaLimits.monthlyMinutes) {
      return {
        isAllowed: false,
        reason: 'Monthly minutes quota exceeded',
        remaining: {
          dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
          monthlyMinutes: 0,
          monthlyHighAccuracyMinutes: Math.max(0, (quotaLimits.monthlyHighAccuracyMinutes || 0) - (usage.monthlyHighAccuracyMinutes || 0))
        },
        usage
      };
    }

    // 检查高精度分钟池（仅 PRO 且 high_accuracy 模式）
    if (modelType === 'high_accuracy' && (quotaLimits.monthlyHighAccuracyMinutes || 0) > 0) {
      if ((usage.monthlyHighAccuracyMinutes || 0) + requestDurationMinutes > (quotaLimits.monthlyHighAccuracyMinutes || 0)) {
        return {
          isAllowed: false,
          reason: 'High-accuracy minutes quota exceeded',
          remaining: {
            dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
            monthlyMinutes: quotaLimits.monthlyMinutes - usage.monthlyMinutes,
            monthlyHighAccuracyMinutes: 0
          },
          usage
        };
      }
    }

    return {
      isAllowed: true,
      remaining: {
        dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
        monthlyMinutes: quotaLimits.monthlyMinutes - usage.monthlyMinutes - requestDurationMinutes,
        monthlyHighAccuracyMinutes: (quotaLimits.monthlyHighAccuracyMinutes || 0) - (usage.monthlyHighAccuracyMinutes || 0) - (modelType === 'high_accuracy' ? requestDurationMinutes : 0)
      },
      usage
    };
  }

  /**
   * 记录使用情况
   */
  async recordUsage(
    userId: string,
    durationMinutes: number,
    modelType: string
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
    try {
      await db().insert(usage_records).values({
        user_id: userId,
        date: today,
        minutes: durationMinutes,
        model_type: modelType,
        created_at: new Date()
      });
    } catch (e) {
      // fallback: ignore duplicate or table missing
      console.log(`Recording usage for ${userId}: ${durationMinutes} minutes with ${modelType}`);
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
        count: sql<number>`COUNT(*) as count`,
        minutes: sql<number>`COALESCE(SUM(${usage_records.minutes}),0) as minutes`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), eq(usage_records.date, today)));

      const [monthly] = await db().select({
        minutes: sql<number>`COALESCE(SUM(${usage_records.minutes}),0) as minutes`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), gte(usage_records.created_at, monthStart)));

      const [monthlyHA] = await db().select({
        minutes: sql<number>`COALESCE(SUM(${usage_records.minutes}),0) as minutes`
      }).from(usage_records).where(and(eq(usage_records.user_id, userId), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'high_accuracy')));

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
