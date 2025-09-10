"use client";

import { useTranslations } from 'next-intl';
import { X, Crown, Sparkles, ChevronRight } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredTier: 'basic' | 'pro';
  feature: string;
}

export function UpgradeModal({ isOpen, onClose, requiredTier, feature }: UpgradeModalProps) {
  const t = useTranslations('tool_interface.results');
  
  if (!isOpen) return null;

  const tierInfo = {
    basic: {
      icon: <Sparkles className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      benefits: [
        'Basic Segmentation',
        '60 min max duration',
        '100 transcriptions/month',
        'SRT/VTT export'
      ]
    },
    pro: {
      icon: <Crown className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      benefits: [
        'AI-powered chapters',
        'Smart summaries',
        'Speaker identification',
        'API access',
        'Priority processing',
        '3 hour max duration',
        '500 transcriptions/month'
      ]
    }
  };

  const tier = tierInfo[requiredTier];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-800">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className={`inline-flex p-3 rounded-xl bg-gradient-to-r ${tier.color} mb-4`}>
          {tier.icon}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold mb-2">
          {requiredTier === 'basic' ? t('upgrade_required_basic') : t('upgrade_required_pro')}
        </h2>

        {/* Description */}
        <p className="text-gray-400 mb-6">
          {feature} is a premium feature. Upgrade to unlock this and many more capabilities.
        </p>

        {/* Benefits */}
        <div className="space-y-2 mb-6">
          <p className="text-sm font-semibold text-gray-300 mb-2">What you'll get:</p>
          {tier.benefits.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-gray-400">
              <ChevronRight className="w-4 h-4 text-green-500" />
              {benefit}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => window.location.href = '/pricing'}
            className={`flex-1 py-3 px-4 rounded-lg bg-gradient-to-r ${tier.color} text-white font-semibold hover:opacity-90 transition-opacity`}
          >
            View Pricing
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}