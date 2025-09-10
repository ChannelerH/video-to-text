/**
 * Subscription Tier System
 * Defines feature access for Free, Basic, and Pro users
 */

export type SubscriptionTier = 'free' | 'basic' | 'pro';

export interface TierFeatures {
  // Smart Features
  timestamps: boolean;           // 时间戳
  basicSegmentation: boolean;    // 基础分段
  aiChapters: boolean;          // AI章节
  aiSummary: boolean;           // AI摘要
  speakerIdentification: boolean; // 说话人识别
  
  // Other Features
  batchProcessing: boolean;     // 批量处理
  apiAccess: boolean;           // API访问
  priorityQueue: boolean;       // 优先队列
}

export interface TierLimits {
  maxDuration: number;          // 最大时长（分钟）
  maxFileSize: number;          // 最大文件大小（MB）
  monthlyLimit: number;         // 月度限额
  concurrentJobs: number;       // 并发任务数
  historyRetention: number;     // 历史保留天数
}

// Feature access matrix
export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  free: {
    timestamps: true,
    basicSegmentation: false,
    aiChapters: false,
    aiSummary: false,
    speakerIdentification: false,
    batchProcessing: false,
    apiAccess: false,
    priorityQueue: false,
  },
  basic: {
    timestamps: true,
    basicSegmentation: true,
    aiChapters: false,
    aiSummary: false,
    speakerIdentification: false,
    batchProcessing: false,
    apiAccess: false,
    priorityQueue: false,
  },
  pro: {
    timestamps: true,
    basicSegmentation: true,
    aiChapters: true,
    aiSummary: true,
    speakerIdentification: true,
    batchProcessing: true,
    apiAccess: true,
    priorityQueue: true,
  }
};

// Usage limits
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    maxDuration: 10,
    maxFileSize: 50,
    monthlyLimit: 10,
    concurrentJobs: 1,
    historyRetention: 7,
  },
  basic: {
    maxDuration: 60,
    maxFileSize: 500,
    monthlyLimit: 100,
    concurrentJobs: 3,
    historyRetention: 30,
  },
  pro: {
    maxDuration: 180,
    maxFileSize: 2000,
    monthlyLimit: 500,
    concurrentJobs: 10,
    historyRetention: 365,
  }
};

// Tier display information
export const TIER_INFO = {
  free: {
    name: 'Free',
    badge: '🆓',
    color: 'gray',
    price: 0,
    currency: 'USD'
  },
  basic: {
    name: 'Basic',
    badge: '💎',
    color: 'blue',
    price: 9.9,
    currency: 'USD'
  },
  pro: {
    name: 'Pro',
    badge: '👑',
    color: 'purple',
    price: 29.9,
    currency: 'USD'
  }
};

// Queue priorities
export const QUEUE_PRIORITY = {
  free: 0,    // Lowest priority
  basic: 5,   // Normal priority
  pro: 10     // Highest priority
};

/**
 * Subscription Manager Class
 */
export class SubscriptionManager {
  /**
   * Get user's subscription tier
   */
  static getUserTier(user: any): SubscriptionTier {
    // TODO: Implement actual user tier lookup from database
    // For now, return from user object or default to free
    return user?.subscriptionTier || 'free';
  }

  /**
   * Check if user has access to a specific feature
   */
  static hasFeature(user: any, feature: keyof TierFeatures): boolean {
    const tier = this.getUserTier(user);
    return TIER_FEATURES[tier][feature];
  }

  /**
   * Check if user is within limits
   */
  static checkLimit(user: any, limitType: keyof TierLimits, value: number): boolean {
    const tier = this.getUserTier(user);
    const limit = TIER_LIMITS[tier][limitType];
    return value <= limit;
  }

  /**
   * Get all features for a tier
   */
  static getTierFeatures(tier: SubscriptionTier): TierFeatures {
    return TIER_FEATURES[tier];
  }

  /**
   * Get all limits for a tier
   */
  static getTierLimits(tier: SubscriptionTier): TierLimits {
    return TIER_LIMITS[tier];
  }

  /**
   * Check if user needs upgrade for a feature
   */
  static getRequiredTierForFeature(feature: keyof TierFeatures): SubscriptionTier | null {
    if (TIER_FEATURES.free[feature]) return 'free';
    if (TIER_FEATURES.basic[feature]) return 'basic';
    if (TIER_FEATURES.pro[feature]) return 'pro';
    return null;
  }

  /**
   * Get queue priority for user
   */
  static getQueuePriority(user: any): number {
    const tier = this.getUserTier(user);
    return QUEUE_PRIORITY[tier];
  }

  /**
   * Check if user can perform action
   */
  static canPerformAction(user: any, action: {
    feature?: keyof TierFeatures;
    fileSize?: number;
    duration?: number;
    monthlyUsage?: number;
  }): { allowed: boolean; reason?: string; requiredTier?: SubscriptionTier } {
    const tier = this.getUserTier(user);
    
    // Check feature access
    if (action.feature && !this.hasFeature(user, action.feature)) {
      const requiredTier = this.getRequiredTierForFeature(action.feature);
      return {
        allowed: false,
        reason: `This feature requires ${requiredTier} subscription`,
        requiredTier: requiredTier || 'pro'
      };
    }

    // Check file size limit
    if (action.fileSize && !this.checkLimit(user, 'maxFileSize', action.fileSize)) {
      return {
        allowed: false,
        reason: `File size exceeds ${TIER_LIMITS[tier].maxFileSize}MB limit`,
        requiredTier: this.getTierForFileSize(action.fileSize)
      };
    }

    // Check duration limit
    if (action.duration && !this.checkLimit(user, 'maxDuration', action.duration)) {
      return {
        allowed: false,
        reason: `Duration exceeds ${TIER_LIMITS[tier].maxDuration} minutes limit`,
        requiredTier: this.getTierForDuration(action.duration)
      };
    }

    // Check monthly usage
    if (action.monthlyUsage && !this.checkLimit(user, 'monthlyLimit', action.monthlyUsage)) {
      return {
        allowed: false,
        reason: `Monthly limit of ${TIER_LIMITS[tier].monthlyLimit} transcriptions reached`,
        requiredTier: 'basic'
      };
    }

    return { allowed: true };
  }

  /**
   * Get minimum tier for file size
   */
  private static getTierForFileSize(sizeInMB: number): SubscriptionTier {
    if (sizeInMB <= TIER_LIMITS.free.maxFileSize) return 'free';
    if (sizeInMB <= TIER_LIMITS.basic.maxFileSize) return 'basic';
    return 'pro';
  }

  /**
   * Get minimum tier for duration
   */
  private static getTierForDuration(durationInMinutes: number): SubscriptionTier {
    if (durationInMinutes <= TIER_LIMITS.free.maxDuration) return 'free';
    if (durationInMinutes <= TIER_LIMITS.basic.maxDuration) return 'basic';
    return 'pro';
  }
}