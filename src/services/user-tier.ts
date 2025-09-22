import { findUserByUuid } from "@/models/user";
import { getActiveOrdersByUserUuid } from "@/models/order";
import { db } from '@/db';
import { orders } from '@/db/schema';
import { eq, and, gte, lte, sql, or, isNull } from 'drizzle-orm';
import { getMinuteSummary } from './minutes';

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
    aiSummary: true,     // FREE: 不开放全片，仅预览由路由控制
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

// Helper function to get tier rank
function getTierRank(tier: UserTier): number {
  const rank: Record<UserTier, number> = {
    [UserTier.FREE]: 0,
    [UserTier.BASIC]: 1,
    [UserTier.PRO]: 2,
    [UserTier.PREMIUM]: 3,
  };
  return rank[tier];
}

/**
 * 检查是否有活跃的分钟包
 */
async function checkHasActiveMinutePacks(userUuid: string): Promise<boolean> {
  try {
    const packSummary = await getMinuteSummary(userUuid);
    const remaining = Number(packSummary.std || 0);
    return remaining > 0;
  } catch (error) {
    console.error('Error checking minute packs:', error);
    return false;
  }
}

/**
 * 根据用户UUID获取用户等级
 * 基于订单类型判断：
 * - basic_monthly, basic_yearly -> BASIC
 * - pro_monthly, pro_yearly -> PRO  
 * - premium_monthly, premium_yearly -> PREMIUM
 * - 没有订阅 -> FREE
 * - FREE用户有分钟包 -> BASIC权限
 */
export async function getUserTier(userUuid: string): Promise<UserTier> {
  if (!userUuid) {
    return UserTier.FREE;
  }

  try {
    const now = new Date();
    
    // 查询有效期内的订阅类订单
    const activeSubscriptions = await db()
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.user_uuid, userUuid),
          eq(orders.status, 'paid'),
          sql`${orders.order_type} IN ('basic_monthly', 'basic_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')`,
          or(
            isNull(orders.expired_at),
            gte(orders.expired_at, now)
          )
        )
      );

    // 如果有多个订阅，取最高等级
    let highestTier = UserTier.FREE;
    
    for (const order of activeSubscriptions) {
      let tier = UserTier.FREE;
      const orderType = order.order_type || '';
      
      if (orderType.includes('premium')) {
        tier = UserTier.PREMIUM;
      } else if (orderType.includes('pro')) {
        tier = UserTier.PRO;
      } else if (orderType.includes('basic')) {
        tier = UserTier.BASIC;
      }
      
      if (getTierRank(tier) > getTierRank(highestTier)) {
        highestTier = tier;
      }
    }
    
    // 特殊情况：FREE用户有分钟包时，获得BASIC权限
    if (highestTier === UserTier.FREE) {
      const hasActivePacks = await checkHasActiveMinutePacks(userUuid);
      if (hasActivePacks) {
        return UserTier.BASIC; // 有分钟包的FREE用户享受BASIC权限
      }
    }
    
    return highestTier;
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

/**
 * Check if user has high accuracy features through tier OR minute packs
 * This allows users with high_accuracy minute packs to use pro features
 */
export async function hasHighAccuracyAccess(userUuid: string): Promise<boolean> {
  if (!userUuid) return false;
  try {
    // New policy: High-accuracy is a Pro/Premium right only.
    const userTier = await getUserTier(userUuid);
    return userTier === UserTier.PRO || userTier === UserTier.PREMIUM;
  } catch (error) {
    console.error('Error checking high accuracy access:', error);
    return false;
  }
}

/**
 * 获取用户所有活跃订阅的详细信息
 */
export async function getUserActiveSubscriptions(userUuid: string) {
  if (!userUuid) return [];
  
  try {
    const now = new Date();
    
    const activeSubscriptions = await db()
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.user_uuid, userUuid),
          eq(orders.status, 'paid'),
          sql`${orders.order_type} IN ('basic_monthly', 'basic_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')`,
          or(
            isNull(orders.expired_at),
            gte(orders.expired_at, now)
          )
        )
      );
    
    return activeSubscriptions.map(order => ({
      orderNo: order.order_no,
      type: order.order_type as string,
      expiresAt: order.expired_at,
      createdAt: order.created_at,
      productName: order.product_name,
      credits: order.credits
    }));
  } catch (error) {
    console.error('Error getting user subscriptions:', error);
    return [];
  }
}

/**
 * 获取订阅类型对应的月度分钟数
 */
