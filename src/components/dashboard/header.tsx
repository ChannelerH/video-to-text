'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, AlertCircle } from 'lucide-react';

interface UsageData {
  minutesUsed: number;
  minutesLimit: number;
  tier: 'free' | 'basic' | 'pro';
}

export default function DashboardHeader() {
  const tDashboard = useTranslations('dashboard');
  const tUsage = useTranslations('dashboard.usage');
  const [usage, setUsage] = useState<UsageData>({
    minutesUsed: 8,
    minutesLimit: 10,
    tier: 'free'
  });

  useEffect(() => {
    // Fetch actual usage data
    fetchUsageData();
  }, []);

  const fetchUsageData = async () => {
    try {
      const res = await fetch('/api/user/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
    }
  };

  const usagePercentage = (usage.minutesUsed / usage.minutesLimit) * 100;
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = usagePercentage >= 100;

  return (
    <header className="border-b border-purple-500/20 bg-gray-900/30 backdrop-blur-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Usage Stats */}
          <div className="flex items-center gap-6">
            {/* Minutes Usage */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Clock className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{tUsage('monthly_usage')}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-white">
                    {usage.minutesUsed}
                  </span>
                  <span className="text-sm text-gray-400">
                    / {usage.minutesLimit} {tUsage('minutes')}
                  </span>
                </div>
              </div>
            </div>

            {/* Usage Bar */}
            <div className="hidden sm:block w-48">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    isAtLimit 
                      ? 'bg-red-500' 
                      : isNearLimit 
                      ? 'bg-yellow-500' 
                      : 'bg-gradient-to-r from-purple-500 to-pink-500'
                  }`}
                />
              </div>
              {isNearLimit && (
                <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {isAtLimit ? tUsage('limit_reached') : tUsage('near_limit')}
                </p>
              )}
            </div>
          </div>

          {/* Upgrade Prompt */}
          {usage.tier === 'free' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden md:flex items-center gap-3 px-4 py-2 rounded-lg
                bg-gradient-to-r from-purple-500/10 to-pink-500/10
                border border-purple-500/20"
            >
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-300">
                {tUsage('upgrade_for_more')}
              </span>
              <button className="px-3 py-1 text-xs font-medium
                bg-gradient-to-r from-purple-500 to-pink-500 text-white
                rounded hover:opacity-90 transition-opacity"
              >
                {tDashboard('upgrade')}
              </button>
            </motion.div>
          )}
        </div>

        {/* Mobile Usage Warning */}
        {isNearLimit && (
          <div className="sm:hidden mt-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-yellow-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {isAtLimit ? tUsage('limit_reached') : tUsage('near_limit')}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
