import { findUserByUuid } from "@/models/user";
import { getOrdersByUserUuid } from "@/models/order";

export enum UserTier {
  FREE = 'free',
  BASIC = 'basic', 
  PRO = 'pro',
  PREMIUM = 'premium'
}

interface UserTierInfo {
  tier: UserTier;
  displayName: string;
  features: string[];
}

/**
 * 根据用户UUID获取用户等级
 */
export async function getUserTier(userUuid: string): Promise<UserTier> {
  if (!userUuid) {
    return UserTier.FREE;
  }

  try {
    // 获取用户的已付费订单
    const activeOrders = await getOrdersByUserUuid(userUuid);
    
    if (!activeOrders || activeOrders.length === 0) {
      return UserTier.FREE;
    }

    // 根据订单产品名称判断等级（需要根据实际产品名称调整）
    for (const order of activeOrders) {
      const productName = order.product_name?.toLowerCase() || '';
      
      if (productName.includes('premium') || productName.includes('enterprise')) {
        return UserTier.PREMIUM;
      }
      
      if (productName.includes('pro') || productName.includes('professional')) {
        return UserTier.PRO;
      }
      
      if (productName.includes('basic') || productName.includes('starter')) {
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
        features: ['Incredibly Fast Processing (4s)', 'Unlimited Hours', 'Priority Support']
      };
      
    case UserTier.PRO:
      return {
        tier,
        displayName: 'Professional', 
        features: ['Incredibly Fast Processing (4s)', '20 Hours/Month', 'All Formats']
      };
      
    case UserTier.BASIC:
      return {
        tier,
        displayName: 'Basic',
        features: ['Standard Processing (8min)', '5 Hours/Month', 'Basic Formats']
      };
      
    case UserTier.FREE:
    default:
      return {
        tier,
        displayName: 'Free',
        features: ['90s Preview Only', 'Fast Preview Processing']
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