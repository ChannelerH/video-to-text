import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

interface PricingCTAProps {
  locale: string;
}

export default async function PricingCTA({ locale }: PricingCTAProps) {
  const t = await getTranslations('pricing_cta');

  return (
    <section className="py-16 px-4 bg-gradient-to-b from-gray-950 to-gray-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            {t('title')}
          </h2>
          <p className="text-xl text-gray-300 mb-2">
            {t('subtitle')}
          </p>
          <p className="text-gray-400">
            {t('description')}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {/* Free Tier */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
            <h3 className="text-lg font-semibold text-white mb-2">
              {t('free_tier')}
            </h3>
            <div className="text-3xl font-bold text-white mb-1">
              $0
            </div>
            <div className="text-gray-400 text-sm mb-4">
              {t('free_minutes')}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">AI Chapters</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">All Export Formats</span>
              </div>
            </div>
          </div>

          {/* Basic Tier */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
            <h3 className="text-lg font-semibold text-white mb-2">
              {t('basic_tier')}
            </h3>
            <div className="text-3xl font-bold text-white mb-1">
              {t('basic_price')}
              <span className="text-base font-normal text-gray-400">/mo</span>
            </div>
            <div className="text-gray-400 text-sm mb-4">
              {t('basic_minutes')}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">Everything in Free</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">More Minutes</span>
              </div>
            </div>
          </div>

          {/* Pro Tier */}
          <div className="relative bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-6 hover:border-purple-500/50 transition-colors">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-semibold rounded-full">
                {t('pro_badge')}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {t('pro_tier')}
            </h3>
            <div className="text-3xl font-bold text-white mb-1">
              {t('pro_price')}
              <span className="text-base font-normal text-gray-400">/mo</span>
            </div>
            <div className="text-gray-400 text-sm mb-4">
              {t('pro_minutes')}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">Everything in Basic</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">High Accuracy Mode</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                <span className="text-sm text-gray-300">Priority Queue</span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 
              text-white font-medium rounded-lg hover:opacity-90 transition-opacity group"
          >
            {t('button')}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}