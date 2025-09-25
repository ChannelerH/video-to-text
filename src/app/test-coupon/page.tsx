'use client';

import { useEffect, useState } from 'react';
import { X, Copy, CheckCircle, Gift } from 'lucide-react';

// Test configuration - 10 seconds instead of 5 minutes
const TEST_COUPON_CONFIG = {
  code: 'BROWSE5',
  discount: '15% OFF',
  displayDelay: 10 * 1000,  // 10 seconds for testing
  cooldownPeriod: 7 * 24 * 60 * 60 * 1000,
  sessionKey: 'TEST_BROWSE5_SESSION_SHOWN',
  storageKey: 'TEST_BROWSE5_LAST_SHOWN',
  dismissedKey: 'TEST_BROWSE5_DISMISSED',
};

export default function TestCouponPage() {
  const [showCoupon, setShowCoupon] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [canShow, setCanShow] = useState(true);

  useEffect(() => {
    // Check if can show
    const checkCanShow = () => {
      if (sessionStorage.getItem(TEST_COUPON_CONFIG.sessionKey)) {
        setCanShow(false);
        return false;
      }
      const lastShown = localStorage.getItem(TEST_COUPON_CONFIG.storageKey);
      if (lastShown) {
        const timeSinceShown = Date.now() - parseInt(lastShown);
        if (timeSinceShown < TEST_COUPON_CONFIG.cooldownPeriod) {
          setCanShow(false);
          return false;
        }
      }
      return true;
    };

    if (!checkCanShow()) {
      return;
    }

    // Countdown timer
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowCoupon(true);
          sessionStorage.setItem(TEST_COUPON_CONFIG.sessionKey, '1');
          localStorage.setItem(TEST_COUPON_CONFIG.storageKey, Date.now().toString());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(TEST_COUPON_CONFIG.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = () => {
    setShowCoupon(false);
  };

  const handleReset = () => {
    sessionStorage.removeItem(TEST_COUPON_CONFIG.sessionKey);
    localStorage.removeItem(TEST_COUPON_CONFIG.storageKey);
    localStorage.removeItem(TEST_COUPON_CONFIG.dismissedKey);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Discount Coupon Test Page</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Status</h2>
          <div className="space-y-2">
            <p>Can show coupon: <span className={canShow ? "text-green-500" : "text-red-500"}>{canShow ? "Yes" : "No"}</span></p>
            <p>Time until coupon shows: <span className="text-yellow-500">{timeLeft}s</span></p>
            <p>Coupon visible: <span className={showCoupon ? "text-green-500" : "text-gray-500"}>{showCoupon ? "Yes" : "No"}</span></p>
          </div>
          
          <button
            onClick={handleReset}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Reset All Settings
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Wait 10 seconds on this page</li>
            <li>The discount coupon will automatically appear</li>
            <li>After dismissing, refresh the page - it won't show again this session</li>
            <li>Use "Reset All Settings" to clear all stored data and test again</li>
          </ol>
        </div>
      </div>

      {/* Coupon Modal */}
      {showCoupon && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fadeIn"
            onClick={handleDismiss}
          />
          
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-slideUp">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-[90vw]">
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-6 animate-bounce">
                  <Gift className="w-8 h-8 text-white" />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Test Coupon Appeared!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  This appeared after 10 seconds (5 minutes in production)
                </p>

                <div className="relative bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 mb-6">
                  <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-2">
                    {TEST_COUPON_CONFIG.discount}
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <code className="text-xl font-mono font-bold text-gray-800 dark:text-gray-200">
                      {TEST_COUPON_CONFIG.code}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      {copied ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleCopy}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all transform hover:scale-105"
                  >
                    Copy Code
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}