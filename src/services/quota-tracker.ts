import { db } from '@/db';
import { sql } from 'drizzle-orm';

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
  };
  usage: {
    dailyRequests: number;
    monthlyMinutes: number;
  };
}

export class QuotaTracker {
  /**
   * 检查用户配额
   */
  async checkQuota(
    userId: string,
    userTier: string,
    requestDurationMinutes: number = 0
  ): Promise<QuotaStatus> {
    const quotaLimits = this.getQuotaLimits(userTier);
    const usage = await this.getUserUsage(userId);

    // 无限制用户
    if (quotaLimits.dailyRequests === Infinity) {
      return {
        isAllowed: true,
        remaining: {
          dailyRequests: Infinity,
          monthlyMinutes: Infinity
        },
        usage: {
          dailyRequests: usage.dailyRequests,
          monthlyMinutes: usage.monthlyMinutes
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
          monthlyMinutes: Math.max(0, quotaLimits.monthlyMinutes - usage.monthlyMinutes)
        },
        usage
      };
    }

    // 检查月度时长限制
    if (usage.monthlyMinutes + requestDurationMinutes > quotaLimits.monthlyMinutes) {
      return {
        isAllowed: false,
        reason: 'Monthly minutes quota exceeded',
        remaining: {
          dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
          monthlyMinutes: 0
        },
        usage
      };
    }

    return {
      isAllowed: true,
      remaining: {
        dailyRequests: quotaLimits.dailyRequests - usage.dailyRequests,
        monthlyMinutes: quotaLimits.monthlyMinutes - usage.monthlyMinutes - requestDurationMinutes
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
      // 这里应该记录到数据库
      // 简化示例，实际需要创建 usage_records 表
      console.log(`Recording usage for ${userId}: ${durationMinutes} minutes with ${modelType}`);
      
      // await db().insert(usageRecords).values({
      //   user_id: userId,
      //   date: today,
      //   minutes: durationMinutes,
      //   model_type: modelType,
      //   created_at: new Date()
      // });
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
  }> {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // 简化示例，实际需要从数据库查询
    // const dailyUsage = await db()
    //   .select({
    //     count: sql`COUNT(*)`,
    //     minutes: sql`SUM(minutes)`
    //   })
    //   .from(usageRecords)
    //   .where(and(
    //     eq(usageRecords.user_id, userId),
    //     eq(usageRecords.date, today)
    //   ));

    // const monthlyUsage = await db()
    //   .select({
    //     minutes: sql`SUM(minutes)`
    //   })
    //   .from(usageRecords)
    //   .where(and(
    //     eq(usageRecords.user_id, userId),
    //     gte(usageRecords.created_at, monthStart)
    //   ));

    // 返回模拟数据
    return {
      dailyRequests: 0,
      monthlyMinutes: 0
    };
  }

  /**
   * 获取配额限制
   */
  private getQuotaLimits(userTier: string): {
    dailyRequests: number;
    monthlyMinutes: number;
  } {
    switch (userTier) {
      case 'premium':
        return {
          dailyRequests: Infinity,
          monthlyMinutes: Infinity
        };
      case 'pro':
        return {
          dailyRequests: 200,
          monthlyMinutes: 1200 // 20 hours
        };
      case 'basic':
        return {
          dailyRequests: 50,
          monthlyMinutes: 300 // 5 hours
        };
      case 'free':
      default:
        return {
          dailyRequests: 5,
          monthlyMinutes: 30 // 30 minutes
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