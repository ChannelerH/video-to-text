'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Check, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  trigger?: 'usage_limit' | 'feature_locked' | 'export_format';
  locale?: string;
}

export function UpgradePrompt({ 
  isOpen, 
  onClose, 
  trigger = 'usage_limit',
  locale = 'en' 
}: UpgradePromptProps) {
  const t = useTranslations('upgrade');
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('pro');

  const features = {
    basic: [
      { text: t('features.basic.minutes'), value: '100 minutes/month' },
      { text: t('features.basic.file_size'), value: '200MB max' },
      { text: t('features.basic.export'), value: 'TXT, SRT, VTT' },
      { text: t('features.basic.editor'), value: '✓' },
      { text: t('features.basic.chapters'), value: '✓' },
    ],
    pro: [
      { text: t('features.pro.minutes'), value: '1000 minutes/month' },
      { text: t('features.pro.file_size'), value: '500MB max' },
      { text: t('features.pro.export'), value: 'All formats + PDF' },
      { text: t('features.pro.editor'), value: '✓ Advanced' },
      { text: t('features.pro.chapters'), value: '✓ AI-powered' },
      { text: t('features.pro.refinement'), value: '✓ AI refinement' },
    ],
  };

  const prices = {
    basic: { monthly: 9.99, yearly: 99.99 },
    pro: { monthly: 19.99, yearly: 199.99 },
  };

  const getTriggerMessage = () => {
    switch (trigger) {
      case 'usage_limit':
        return t('trigger.usage_limit');
      case 'feature_locked':
        return t('trigger.feature_locked');
      case 'export_format':
        return t('trigger.export_format');
      default:
        return t('trigger.default');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-4xl bg-gray-900 rounded-2xl shadow-2xl border border-purple-500/20">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              {/* Header */}
              <div className="p-8 text-center border-b border-gray-800">
                <div className="inline-flex p-3 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 mb-4">
                  <Zap className="w-8 h-8 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                  {t('title')}
                </h2>
                <p className="text-gray-400">
                  {getTriggerMessage()}
                </p>
              </div>

              {/* Plans */}
              <div className="p-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Basic Plan */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedPlan('basic')}
                    className={`relative p-6 rounded-xl cursor-pointer transition-all ${
                      selectedPlan === 'basic'
                        ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-500'
                        : 'bg-gray-800/50 border border-gray-700 hover:border-purple-500/50'
                    }`}
                  >
                    {selectedPlan === 'basic' && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full">
                          {t('selected')}
                        </span>
                      </div>
                    )}
                    
                    <h3 className="text-xl font-bold text-white mb-2">Basic</h3>
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-white">${prices.basic.monthly}</span>
                      <span className="text-gray-400">/month</span>
                    </div>
                    
                    <ul className="space-y-3">
                      {features.basic.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span className="text-sm text-gray-300">{feature.value}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>

                  {/* Pro Plan */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedPlan('pro')}
                    className={`relative p-6 rounded-xl cursor-pointer transition-all ${
                      selectedPlan === 'pro'
                        ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-2 border-purple-500'
                        : 'bg-gray-800/50 border border-gray-700 hover:border-purple-500/50'
                    }`}
                  >
                    {selectedPlan === 'pro' && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 bg-purple-600 text-white text-xs rounded-full">
                          {t('recommended')}
                        </span>
                      </div>
                    )}
                    
                    <h3 className="text-xl font-bold text-white mb-2">Pro</h3>
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-white">${prices.pro.monthly}</span>
                      <span className="text-gray-400">/month</span>
                    </div>
                    
                    <ul className="space-y-3">
                      {features.pro.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span className="text-sm text-gray-300">{feature.value}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                </div>

                {/* CTA Button */}
                <div className="mt-8 text-center">
                  <Link
                    href={`/${locale}/pricing`}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 
                      text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
                  >
                    <TrendingUp className="w-5 h-5" />
                    {t('upgrade_now')} - {selectedPlan === 'basic' ? 'Basic' : 'Pro'}
                  </Link>
                  
                  <p className="text-xs text-gray-500 mt-3">
                    {t('cancel_anytime')}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}