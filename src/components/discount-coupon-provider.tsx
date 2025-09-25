'use client';

import { DiscountCouponIntl } from '@/components/discount-coupon-intl';
import { useUserPurchaseStatus } from '@/hooks/use-user-purchase-status';

export function DiscountCouponProvider() {
  const { hasPurchased, subscription, isLoading } = useUserPurchaseStatus();

  // Don't show while loading to prevent flashing
  if (isLoading) {
    return null;
  }

  return (
    <DiscountCouponIntl 
      userHasPurchased={hasPurchased}
      userSubscription={subscription}
    />
  );
}