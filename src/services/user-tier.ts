import { findUserByUuid } from "@/models/user";
import { getActiveOrdersByUserUuid } from "@/models/order";

export enum UserTier {
  FREE = 'free',
  BASIC = 'basic', 
  PRO = 'pro',
  PREMIUM = 'premium'
}

// Feature access matrix for different tiers
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
  priorityQueue: boolean;       // 优先队列 (TODO: 第一版暂不启用)
}

interface UserTierInfo {
  tier: UserTier;
  displayName: string;
  features: string[];
  featureAccess: TierFeatures;
}

// Feature access configuration for each tier
export const TIER_FEATURES: Record<UserTier, TierFeatures> = {
  [UserTier.FREE]: {
    timestamps: true,
    basicSegmentation: false,
    aiChapters: true,     // FREE: 仅预览（由路由限制）
    aiSummary: false,     // FREE: 不开放全片，仅预览由路由控制
    speakerIdentification: false, // FREE: 不开放全片，仅预览由路由控制
    batchProcessing: false,
    apiAccess: false,
    priorityQueue: false, // TODO: 第一版暂不启用
  },
  [UserTier.BASIC]: {
    timestamps: true,
    basicSegmentation: true,
    aiChapters: true,
    aiSummary: true,
    speakerIdentification: true,
    batchProcessing: false,
    apiAccess: false,
    priorityQueue: false, // TODO: 第一版暂不启用
  },
  [UserTier.PRO]: {
    timestamps: true,
    basicSegmentation: true,
    aiChapters: true,
    aiSummary: true,
    speakerIdentification: true,
    batchProcessing: true,
    apiAccess: true,
    priorityQueue: false, // TODO: 第一版暂不启用，原本应为 true
  },
  [UserTier.PREMIUM]: {
    timestamps: true,
    basicSegmentation: true,
    aiChapters: true,
    aiSummary: true,
    speakerIdentification: true,
    batchProcessing: true,
    apiAccess: true,
    priorityQueue: false, // TODO: 第一版暂不启用，原本应为 true
  }
};

/**
 * 根据用户UUID获取用户等级
 */
export async function getUserTier(userUuid: string): Promise<UserTier> {
  // TODO: integrate real subscription lookup; default to FREE when unknown
  // return UserTier.PRO;

  if (!userUuid) {
    return UserTier.FREE;
  }

  try {
    // 获取用户的"有效期内"的已付费订单
    const activeOrders = await getActiveOrdersByUserUuid(userUuid);
    
    if (!activeOrders || activeOrders.length === 0) {
      return UserTier.FREE;
    }

    // 根据订单产品ID/名称判断等级（优先使用产品ID，回退到名称）
    for (const order of activeOrders) {
      const pid = (order.product_id || '').toLowerCase();
      const pname = (order.product_name || '').toLowerCase();
      const idOrName = `${pid} ${pname}`;

      if (/premium|enterprise/.test(idOrName)) {
        return UserTier.PREMIUM;
      }
      if (/pro|professional/.test(idOrName)) {
        return UserTier.PRO;
      }
      if (/basic|starter/.test(idOrName)) {
        return UserTier.BASIC;
      }
    }

    // 如果有付费订单但无法识别具体等级，默认为基础版
    return UserTier.BASIC;
    
  } catch (error) {
    console.error('Error getting user tier:', error);
    return UserTier.FREE;
  }
}

/**
 * 获取用户等级详细信息
 */
export function getUserTierInfo(tier: UserTier): UserTierInfo {
  switch (tier) {
    case UserTier.PREMIUM:
      return {
        tier,
        displayName: 'Premium',
        features: ['Incredibly Fast Processing (4s)', 'Unlimited Hours', 'Priority Support'],
        featureAccess: TIER_FEATURES[tier]
      };
      
    case UserTier.PRO:
      return {
        tier,
        displayName: 'Professional', 
        features: ['Incredibly Fast Processing (4s)', '20 Hours/Month', 'All Formats'],
        featureAccess: TIER_FEATURES[tier]
      };
      
    case UserTier.BASIC:
      return {
        tier,
        displayName: 'Basic',
        features: ['Standard Processing (8min)', '5 Hours/Month', 'Basic Formats'],
        featureAccess: TIER_FEATURES[tier]
      };
      
    case UserTier.FREE:
    default:
      return {
        tier,
        displayName: 'Free',
        features: ['5-minute Preview Only', 'Fast Preview Processing'],
        featureAccess: TIER_FEATURES[UserTier.FREE]
      };
  }
}

/**
 * 检查用户是否有访问权限
 */
export function hasAccess(userTier: UserTier, requiredTier: UserTier): boolean {
  const tierLevels = {
    [UserTier.FREE]: 0,
    [UserTier.BASIC]: 1,
    [UserTier.PRO]: 2,
    [UserTier.PREMIUM]: 3
  };
  
  return tierLevels[userTier] >= tierLevels[requiredTier];
}

/**
 * Check if user has access to a specific feature
 */
export function hasFeature(userTier: UserTier, feature: keyof TierFeatures): boolean {
  return TIER_FEATURES[userTier][feature];
}

/**
 * Get the minimum tier required for a feature
 */
export function getRequiredTierForFeature(feature: keyof TierFeatures): UserTier | null {
  if (TIER_FEATURES[UserTier.FREE][feature]) return UserTier.FREE;
  if (TIER_FEATURES[UserTier.BASIC][feature]) return UserTier.BASIC;
  if (TIER_FEATURES[UserTier.PRO][feature]) return UserTier.PRO;
  return null;
}
