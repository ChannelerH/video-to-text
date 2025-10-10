"use client";

import { Check, Loader } from "lucide-react";
import { PricingItem, Pricing as PricingType } from "@/types/blocks/pricing";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/icon";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppContext } from "@/contexts/app";
import { useLocale } from "next-intl";

type CheckoutResponse = {
  code: number;
  message: string;
  data?: {
    checkout_url?: string;
    [key: string]: unknown;
  };
};

const isCheckoutResponse = (value: unknown): value is CheckoutResponse => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "number" && typeof record.message === "string";
};

export default function Pricing({ pricing }: { pricing: PricingType }) {
  const t = useTranslations('pricing');
  const qEnabled = (process.env.NEXT_PUBLIC_Q_ENABLED === 'true');

  if (pricing.disabled) {
    return null;
  }

  const locale = useLocale();

  const { user, setShowSignModal } = useAppContext();

  const [group, setGroup] = useState(() => {
    // First look for a group with is_featured set to true
    const featuredGroup = pricing.groups?.find((g) => g.is_featured);
    // If no featured group exists, fall back to the first group
    return featuredGroup?.name || pricing.groups?.[0]?.name;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleCheckout = async (item: PricingItem, cn_pay: boolean = false) => {
    try {
      if (!user) {
        setShowSignModal(true);
        return;
      }

      const params = {
        product_id: item.product_id,
        currency: cn_pay ? "cny" : item.currency,
        locale: locale || "en",
      };

      setIsLoading(true);
      setProductId(item.product_id);

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (response.status === 401) {
        setIsLoading(false);
        setProductId(null);

        setShowSignModal(true);
        return;
      }

      const json: unknown = await response.json();
      if (!isCheckoutResponse(json)) {
        toast.error("checkout failed");
        return;
      }

      const { code, message, data } = json;
      if (code !== 0) {
        toast.error(message);
        return;
      }

      const checkout_url = typeof data?.checkout_url === "string" ? data.checkout_url : undefined;
      if (!checkout_url) {
        toast.error("checkout failed");
        return;
      }

      window.location.href = checkout_url;
    } catch (e) {
      console.log("checkout failed: ", e);

      toast.error("checkout failed");
    } finally {
      setIsLoading(false);
      setProductId(null);
    }
  };

  useEffect(() => {
    if (pricing.items) {
      const featuredItem = pricing.items.find((i) => i.is_featured);
      setProductId(featuredItem?.product_id || pricing.items[0]?.product_id);
      setIsLoading(false);
    }
  }, [pricing.items]);

  return (
    <section id={pricing.name} className="design-section pricing-layout" style={{ overflow: 'visible' }}>
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-2">
            {pricing.title}
          </h2>
          <p className="design-description">
            {pricing.description}
          </p>
        </div>
        <div className="w-full flex flex-col items-center gap-1">
          {pricing.groups && pricing.groups.length > 0 && (
            <div className="w-full px-4 md:px-0 max-w-2xl md:max-w-none md:w-auto mb-10 md:mb-12">
              <div className="pricing-toggle-container flex flex-col md:inline-flex md:flex-row gap-3 md:gap-1 p-2 md:p-1 rounded-2xl md:rounded-lg bg-gray-800/90 md:bg-muted">
                {pricing.groups.map((item, i) => {
                  const isActive = group === item.name;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGroup(item.name || "")}
                      className={`
                        flex flex-col md:flex-row items-center justify-center gap-1.5 md:gap-2
                        px-6 py-3 md:py-2 md:px-6
                        rounded-xl md:rounded-md
                        font-bold text-base
                        transition-all duration-200
                        min-h-[56px] md:min-h-0
                        whitespace-nowrap
                        ${isActive
                          ? 'bg-white shadow-lg'
                          : 'bg-transparent hover:bg-gray-700/50'
                        }
                      `}
                    >
                      <span
                        className="font-bold text-base"
                        style={{
                          color: isActive ? '#111827' : '#f3f4f6',
                          WebkitTextFillColor: isActive ? '#111827' : '#f3f4f6'
                        }}
                      >
                        {item.title}
                      </span>
                      {item.label && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            backgroundColor: isActive ? '#f3e8ff' : 'rgba(168, 85, 247, 0.2)',
                            color: isActive ? '#7c3aed' : '#d8b4fe',
                            WebkitTextFillColor: isActive ? '#7c3aed' : '#d8b4fe',
                            backgroundClip: 'initial',
                            WebkitBackgroundClip: 'initial'
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="design-grid design-grid-3 pricing-grid w-full overflow-visible pt-8 grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            {pricing.items?.map((item, index) => {
              if (item.group && item.group !== group) {
                return null;
              }

              return (
                <div
                  key={index}
                  className={`design-card pricing-card relative overflow-visible text-left ${item.is_featured ? 'featured transform scale-110 z-10 shadow-2xl shadow-purple-500/40 ring-4 ring-purple-400/60 ring-offset-4 ring-offset-gray-900 bg-gradient-to-br from-purple-500/10 to-blue-500/10 animate-pulse md:scale-110' : 'scale-100 md:scale-95 md:opacity-90'}`}
                  style={item.is_featured ? {
                    filter: 'drop-shadow(0 0 20px rgba(147, 51, 234, 0.4)) drop-shadow(0 0 40px rgba(79, 70, 229, 0.3))',
                    animation: 'glow 2s ease-in-out infinite alternate'
                  } : {}}
                >
                  {item.is_featured && (
                    <div className="absolute -top-5 md:-top-6 left-1/2 transform -translate-x-1/2 z-10">
                      <div className="px-4 py-1.5 text-xs md:text-xs font-bold bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full shadow-lg whitespace-nowrap">
                        🔥 {t('most_popular')} 🔥
                      </div>
                    </div>
                  )}
                  <div className="pricing-topbar" />
                  <div className="flex h-full flex-col justify-between gap-5 p-5 md:p-6">
                    <div>
                      <div className="flex items-center gap-2 mb-3 md:mb-4">
                        {item.title && (
                          <h3 className="design-heading-3 text-2xl md:text-2xl font-bold">
                            {item.title}
                          </h3>
                        )}
                        <div className="flex-1"></div>
                        {item.label && (
                          <div className={`design-badge px-3 md:px-4 py-1.5 md:py-2 text-xs font-medium whitespace-nowrap ${item.is_featured ? 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border border-purple-500/30' : ''}`}>
                            {item.label}
                          </div>
                        )}
                      </div>
                      <div className="flex items-end gap-2 mb-3 md:mb-4">
                        {item.original_price && (
                          <span className="text-lg md:text-xl text-muted-foreground font-semibold line-through">
                            {item.original_price}
                          </span>
                        )}
                        {item.price && (
                          <span className={`design-stat-number text-5xl md:text-6xl ${item.is_featured ? 'bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent font-black' : 'font-bold'}`}>
                            {item.price}
                          </span>
                        )}
                        {item.unit && (
                          <span className="block font-semibold text-base md:text-base">
                            {item.unit}
                          </span>
                        )}
                      </div>
                      {(item.description || item.features_title) && (
                        <div className="pricing-summary">
                          {item.description && (
                            <p className="pricing-desc">
                              {item.description}
                            </p>
                          )}
                          {item.features_title && (
                            <p className="pricing-subtitle">
                              {item.features_title}
                            </p>
                          )}
                        </div>
                      )}
                      {item.features && (
                        <>
                          <ul className="design-feature-list space-y-2.5 md:space-y-2">
                            {(expanded[item.product_id] ? item.features : item.features.slice(0, 5))
                              .filter((feature) => {
                                const ftxt = String(feature);
                                if (!qEnabled && (ftxt.includes('Priority queue') || ftxt.includes('优先队列'))) {
                                  return false; // hide when queue is disabled
                                }
                                return true;
                              })
                              .map((feature, fi) => (
                                <li className="design-feature-item text-sm md:text-base leading-relaxed" key={`feature-${fi}`}>
                                  {feature}
                                </li>
                              ))}
                          </ul>
                          {item.features.length > 5 && (
                            <button
                              className="text-sm font-semibold mt-3 md:mt-2 text-purple-300 hover:text-purple-200"
                              onClick={() => setExpanded(prev => ({ ...prev, [item.product_id]: !prev[item.product_id] }))}
                            >
                              {expanded[item.product_id] ? t('show_less') : t('view_full_comparison')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 mt-2 md:mt-0">
                      {item.button && (
                        <button
                          className={`${item.is_featured ? 'design-btn-primary px-8 py-3.5 md:py-3 font-bold text-base bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 shadow-lg shadow-purple-500/30' : 'design-btn-primary py-3.5 md:py-3 text-base'} w-full`}
                          disabled={isLoading}
                          onClick={() => {
                            if (isLoading) {
                              return;
                            }
                            handleCheckout(item);
                          }}
                        >
                          {isLoading && productId === item.product_id && (
                            <Loader className="w-5 h-5 animate-spin" />
                          )}
                          {item.button.title}
                          {item.button.icon && (
                            <Icon name={item.button.icon} className="w-5 h-5" />
                          )}
                        </button>
                      )}
                      {item.cn_amount && item.cn_amount > 0 ? (
                        <div className="flex flex-col md:flex-row items-center justify-center gap-2 pt-2 md:pt-0 md:mt-2 border-t md:border-t-0 border-gray-800/50">
                          <span className="text-sm text-gray-400 mb-1 md:mb-0">{t('cny_payment')} 👉</span>
                          <div
                            className="inline-block p-2 hover:cursor-pointer hover:bg-gray-800/30 rounded-md transition-colors"
                            onClick={() => {
                              if (isLoading) {
                                return;
                              }
                              handleCheckout(item, true);
                            }}
                          >
                            <img
                              src="/imgs/cnpay.png"
                              alt="cnpay"
                              className="w-20 h-10 rounded-lg"
                            />
                          </div>
                        </div>
                      ) : null}
                      {item.tip && (
                        <p className="text-muted-foreground text-xs md:text-sm text-center mt-1">
                          {item.tip}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
