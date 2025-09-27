'use client';

import { useEffect, useState } from 'react';
import { X, Copy, CheckCircle, Gift, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

// Configuration
const COUPON_CONFIG = {
  code: 'BROWSE5',
  displayDelay: 1 * 60 * 1000,              // 1 minute
  cooldownPeriod: 7 * 24 * 60 * 60 * 1000,  // 7 days
  sessionKey: 'BROWSE5_SESSION_SHOWN',
  storageKey: 'BROWSE5_LAST_SHOWN',
  dismissedKey: 'BROWSE5_DISMISSED',
};

interface DiscountCouponProps {
  userHasPurchased?: boolean;
  userSubscription?: string | null;
}

export function DiscountCouponIntl({ userHasPurchased = false, userSubscription = null }: DiscountCouponProps) {
  const [showCoupon, setShowCoupon] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const t = useTranslations('discount_coupon');
  const router = useRouter();

  useEffect(() => {
    // Check if user is eligible to see the coupon
    const canShowCoupon = () => {
      // User has already purchased or has subscription
      if (userHasPurchased || userSubscription) {
        return false;
      }

      // Already shown in this session
      if (sessionStorage.getItem(COUPON_CONFIG.sessionKey)) {
        return false;
      }

      // User explicitly dismissed it
      if (localStorage.getItem(COUPON_CONFIG.dismissedKey) === 'true') {
        return false;
      }

      // Check cooldown period
      const lastShown = localStorage.getItem(COUPON_CONFIG.storageKey);
      if (lastShown) {
        const timeSinceShown = Date.now() - parseInt(lastShown);
        if (timeSinceShown < COUPON_CONFIG.cooldownPeriod) {
          return false;
        }
      }

      return true;
    };

    // Track time spent on page
    let startTime = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const trackTime = () => {
      intervalId = setInterval(() => {
        const currentTimeSpent = Date.now() - startTime;
        setTimeSpent(currentTimeSpent);

        // Check if time threshold has passed
        if (currentTimeSpent >= COUPON_CONFIG.displayDelay && canShowCoupon()) {
          setShowCoupon(true);
          // Mark as shown
          sessionStorage.setItem(COUPON_CONFIG.sessionKey, '1');
          localStorage.setItem(COUPON_CONFIG.storageKey, Date.now().toString());
          if (intervalId) clearInterval(intervalId);
        }
      }, 1000); // Check every second
    };

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, pause tracking
        if (intervalId) clearInterval(intervalId);
      } else {
        // Page is visible again, resume tracking
        if (!showCoupon && canShowCoupon()) {
          trackTime();
        }
      }
    };

    // Start tracking if eligible
    if (canShowCoupon()) {
      trackTime();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userHasPurchased, userSubscription]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CONFIG.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      // Track usage analytics if needed
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'coupon_copied', {
          coupon_code: COUPON_CONFIG.code,
          time_spent: Math.floor(timeSpent / 1000),
        });
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDismiss = () => {
    setShowCoupon(false);
  };

  const handleUseCoupon = async () => {
    // First copy the code
    await handleCopy();
    
    // Wait a bit for user to see the "copied" feedback
    setTimeout(() => {
      // Navigate to pricing page
      router.push('/#pricing');
      setShowCoupon(false);
    }, 500);
  };

  if (!showCoupon) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fadeIn"
        onClick={handleDismiss}
      />
      
      {/* Coupon Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-slideUp">
        <div className="bg-gradient-to-br from-slate-900 via-purple-900/30 to-slate-900 backdrop-blur-xl rounded-3xl shadow-2xl p-10 max-w-md w-[90vw] max-h-[90vh] overflow-auto border border-purple-500/20">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-600/20 via-pink-600/20 to-transparent blur-xl -z-10" />
          
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all group"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
          </button>

          {/* Content */}
          <div className="text-center relative">
            {/* Icon with glow */}
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-xl opacity-60 animate-pulse" />
              <div className="relative inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full shadow-lg shadow-purple-500/30">
                <Gift className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title with emoji */}
            <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
              {t('title')} 
              <span className="inline-block ml-2 animate-bounce">🎉</span>
            </h2>
            
            {/* Subtitle */}
            <p className="text-gray-300 mb-8 text-lg leading-relaxed">
              {t('subtitle')}
            </p>

            {/* Coupon Code Card */}
            <div className="relative mb-8">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-2xl blur-md" />
              
              <div className="relative bg-gradient-to-br from-purple-600/20 via-transparent to-pink-600/20 backdrop-blur-sm rounded-2xl p-6 border border-purple-400/20">
                {/* Discount percentage */}
                <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-pink-300 to-orange-300 mb-4 tracking-tight">
                  {t('discount')}
                </div>
                
                {/* Code display */}
                <div className="bg-black/40 backdrop-blur-md rounded-xl py-4 px-6 flex items-center justify-center gap-3 group">
                  <span className="text-sm text-purple-300 font-medium">CODE:</span>
                  <code className="text-2xl font-mono font-bold text-white tracking-wider">
                    {COUPON_CONFIG.code}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="ml-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all hover:scale-110 group-hover:bg-white/10"
                    aria-label="Copy code"
                  >
                    {copied ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                    )}
                  </button>
                </div>
                
                {/* Copied feedback */}
                {copied && (
                  <div className="absolute -top-2 right-4 bg-green-500 text-white text-sm px-3 py-1 rounded-full animate-slideUp">
                    {t('copied')}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              {t('description')}
              <br />
              <span className="text-purple-400">{t('valid_for')}</span>
            </p>

            {/* CTA Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleUseCoupon}
                className="group relative px-8 py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold overflow-hidden transition-all transform hover:scale-105 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-500/30"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  {t('copy_button')}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button
                onClick={handleDismiss}
                className="px-8 py-3.5 bg-white/5 backdrop-blur-sm text-gray-300 rounded-xl font-semibold hover:bg-white/10 transition-all border border-white/10 hover:border-white/20"
              >
                {t('dismiss_button')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
