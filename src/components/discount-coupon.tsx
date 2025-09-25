'use client';

import { useEffect, useState } from 'react';
import { X, Copy, CheckCircle, Gift } from 'lucide-react';

// Configuration
const COUPON_CONFIG = {
  code: 'BROWSE5',
  discount: '15% OFF',
  displayDelay: 5 * 60 * 1000,              // 5 minutes
  cooldownPeriod: 7 * 24 * 60 * 60 * 1000,  // 7 days
  sessionKey: 'BROWSE5_SESSION_SHOWN',
  storageKey: 'BROWSE5_LAST_SHOWN',
  dismissedKey: 'BROWSE5_DISMISSED',
};

interface DiscountCouponProps {
  userHasPurchased?: boolean;
  userSubscription?: string | null;
}

export function DiscountCoupon({ userHasPurchased = false, userSubscription = null }: DiscountCouponProps) {
  const [showCoupon, setShowCoupon] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);

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
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    const trackTime = () => {
      intervalId = setInterval(() => {
        const currentTimeSpent = Date.now() - startTime;
        setTimeSpent(currentTimeSpent);

        // Check if 5 minutes have passed
        if (currentTimeSpent >= COUPON_CONFIG.displayDelay && canShowCoupon()) {
          setShowCoupon(true);
          // Mark as shown
          sessionStorage.setItem(COUPON_CONFIG.sessionKey, '1');
          localStorage.setItem(COUPON_CONFIG.storageKey, Date.now().toString());
          clearInterval(intervalId);
        }
      }, 1000); // Check every second
    };

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, pause tracking
        clearInterval(intervalId);
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
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userHasPurchased, userSubscription]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CONFIG.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDismiss = () => {
    setShowCoupon(false);
    // Optional: Remember dismissal permanently
    // localStorage.setItem(COUPON_CONFIG.dismissedKey, 'true');
  };

  const handleUseCoupon = () => {
    handleCopy();
    // Track usage analytics if needed
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'coupon_clicked', {
        coupon_code: COUPON_CONFIG.code,
        time_spent: Math.floor(timeSpent / 1000),
      });
    }
  };

  if (!showCoupon) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fadeIn"
        onClick={handleDismiss}
      />
      
      {/* Coupon Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-slideUp">
        <div className="bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-md w-[90vw] max-h-[90vh] overflow-auto border border-purple-500/20">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-400 hover:text-white" />
          </button>

          {/* Content */}
          <div className="text-center">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full mb-6 animate-bounce shadow-lg shadow-purple-500/25">
              <Gift className="w-10 h-10 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-white mb-3">
              Congratulations! 🎉
            </h2>
            <p className="text-gray-300 mb-8 text-lg">
              Thanks for your interest! Here's an exclusive discount for you.
            </p>

            {/* Coupon Code */}
            <div className="relative bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-purple-500/30">
              <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 mb-4">
                {COUPON_CONFIG.discount}
              </div>
              <div className="flex items-center justify-center gap-3 bg-black/30 rounded-xl py-3 px-6 backdrop-blur-sm">
                <code className="text-2xl font-mono font-bold text-white tracking-wider">
                  {COUPON_CONFIG.code}
                </code>
                <button
                  onClick={handleCopy}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all hover:scale-110"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  ) : (
                    <Copy className="w-6 h-6 text-gray-300 hover:text-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">
              Use this code at checkout to get <span className="text-purple-400 font-semibold">{COUPON_CONFIG.discount}</span> on any purchase.
              <br />Valid for new customers only.
            </p>

            {/* CTA Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleUseCoupon}
                className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all transform hover:scale-105 hover:-translate-y-0.5"
              >
                Copy & Continue
              </button>
              <button
                onClick={handleDismiss}
                className="px-8 py-3 bg-white/10 backdrop-blur-sm text-gray-300 rounded-xl font-semibold hover:bg-white/20 transition-all border border-white/10"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Alternative: Floating notification style
export function DiscountCouponFloat({ userHasPurchased = false, userSubscription = null }: DiscountCouponProps) {
  const [showCoupon, setShowCoupon] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canShowCoupon = () => {
      if (userHasPurchased || userSubscription) return false;
      if (sessionStorage.getItem(COUPON_CONFIG.sessionKey)) return false;
      
      const lastShown = localStorage.getItem(COUPON_CONFIG.storageKey);
      if (lastShown) {
        const timeSinceShown = Date.now() - parseInt(lastShown);
        if (timeSinceShown < COUPON_CONFIG.cooldownPeriod) return false;
      }
      
      return true;
    };

    let timeoutId: NodeJS.Timeout;
    
    if (canShowCoupon()) {
      timeoutId = setTimeout(() => {
        setShowCoupon(true);
        sessionStorage.setItem(COUPON_CONFIG.sessionKey, '1');
        localStorage.setItem(COUPON_CONFIG.storageKey, Date.now().toString());
      }, COUPON_CONFIG.displayDelay);
    }

    return () => clearTimeout(timeoutId);
  }, [userHasPurchased, userSubscription]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(COUPON_CONFIG.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!showCoupon) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40 animate-slideUp">
        <button
          onClick={() => setMinimized(false)}
          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full p-3 shadow-lg hover:scale-110 transition-transform"
        >
          <Gift className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 animate-slideUp">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Gift className="w-8 h-8 text-purple-500" />
          </div>
          <div className="flex-grow">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Special Offer!
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Get {COUPON_CONFIG.discount} with code:
            </p>
            <div className="flex items-center gap-2">
              <code className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded font-mono font-bold">
                {COUPON_CONFIG.code}
              </code>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}