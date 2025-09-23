import { getPricingPage } from '@/services/page';
import type { PricingItem } from '@/types/blocks/pricing';
import type { SubscriptionPlan } from '@/services/user-subscription';

export type DowngradeTarget = 'free' | 'basic_monthly' | 'basic_yearly';

export interface DowngradePlanDefinition {
  target: DowngradeTarget;
  plan: SubscriptionPlan;
  label: string;
  orderType?: string;
  productId?: string;
  interval?: 'month' | 'year';
}

export interface DowngradePlanPricing extends DowngradePlanDefinition {
  amount: number;
  currency: string;
  productName: string;
}

interface DowngradePlanMeta {
  label: string;
  plan: SubscriptionPlan;
  orderType?: string;
  productId?: string;
  interval?: 'month' | 'year';
}

const PLAN_META: Record<Exclude<DowngradeTarget, 'free'>, DowngradePlanMeta> = {
  basic_monthly: {
    label: 'Basic Monthly',
    plan: 'BASIC',
    orderType: 'basic_monthly',
    productId: 'basic-monthly',
    interval: 'month',
  },
  basic_yearly: {
    label: 'Basic Yearly',
    plan: 'BASIC',
    orderType: 'basic_yearly',
    productId: 'basic-yearly',
    interval: 'year',
  },
};

export function resolveDowngradePlan(target: DowngradeTarget): DowngradePlanDefinition {
  if (target === 'free') {
    return {
      target,
      plan: 'FREE',
      label: 'Free',
    };
  }

  const meta = PLAN_META[target];
  if (!meta) {
    throw new Error(`unsupported-downgrade-target:${target}`);
  }

  return {
    target,
    label: meta.label,
    plan: meta.plan,
    orderType: meta.orderType,
    productId: meta.productId,
    interval: meta.interval,
  };
}

export async function getDowngradePlanPricing(
  target: Exclude<DowngradeTarget, 'free'>,
  locale: string = 'en'
): Promise<DowngradePlanPricing> {
  const definition = resolveDowngradePlan(target);
  const pricingPage = await getPricingPage(locale);
  const items: PricingItem[] = pricingPage?.pricing?.items || [];

  const matchedItem = items.find((item) => {
    if (definition.orderType && item.order_type) {
      return item.order_type === definition.orderType;
    }
    if (definition.productId) {
      return item.product_id === definition.productId;
    }
    return false;
  });

  if (!matchedItem) {
    throw new Error(`pricing-definition-missing:${target}`);
  }

  if (typeof matchedItem.amount !== 'number' || !matchedItem.currency) {
    throw new Error(`pricing-definition-incomplete:${target}`);
  }

  if (definition.interval && matchedItem.interval !== definition.interval) {
    console.warn(
      `Downgrade plan interval mismatch for ${target}: expected ${definition.interval}, got ${matchedItem.interval}`
    );
  }

  return {
    ...definition,
    amount: matchedItem.amount,
    currency: matchedItem.currency,
    productName: matchedItem.product_name || matchedItem.title || definition.label,
  };
}
