/**
 * 根据产品信息判断订单类型
 * 优先使用显式的 orderType，如果没有则根据产品信息推断
 */
export function getOrderType(
  productId: string,
  productName: string,
  interval?: string,
  explicitOrderType?: string
): string {
  // 如果有显式的 order_type（来自元数据/已有记录），直接使用
  if (explicitOrderType) {
    return explicitOrderType;
  }

  const pid = (productId || '').toLowerCase();
  const pname = (productName || '').toLowerCase();

  // Stripe 的产品 id 都是 prod_ 开头，避免把 prod_ 当成 pro
  const pidForMatch = pid.startsWith('prod_') ? '' : pid;
  const combined = `${pidForMatch} ${pname}`.trim();
  
  // 分钟包判断
  if (pid.startsWith('std-') || pid.startsWith('ha-') || 
      combined.includes('minute') || combined.includes('pack')) {
    return 'minute_pack';
  }
  
  // 订阅类型判断
  const isYearly = interval === 'year' || interval === 'annual' || 
                   combined.includes('year') || combined.includes('annual');
  const isMonthly = interval === 'month' || combined.includes('month');
  
  // Premium 订阅
  if (combined.includes('premium') || combined.includes('enterprise')) {
    if (isYearly) return 'premium_yearly';
    if (isMonthly) return 'premium_monthly';
    return 'premium_monthly'; // 默认月度
  }
  
  // Pro 订阅
  if (combined.includes('pro') || combined.includes('professional')) {
    if (isYearly) return 'pro_yearly';
    if (isMonthly) return 'pro_monthly';
    return 'pro_monthly'; // 默认月度
  }
  
  // Basic 订阅
  if (combined.includes('basic') || combined.includes('starter')) {
    if (isYearly) return 'basic_yearly';
    if (isMonthly) return 'basic_monthly';
    return 'basic_monthly'; // 默认月度
  }
  
  // 默认为分钟包
  return 'minute_pack';
}
