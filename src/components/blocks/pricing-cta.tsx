import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

interface PricingCTAProps {
  locale: string;
}

function FeatureItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  );
}

export default async function PricingCTA({ locale }: PricingCTAProps) {
  const t = await getTranslations('pricing_cta');
  const freeFeatures = ["AI Chapters", "All Export Formats"];
  const basicFeatures = ["Everything in Free", "More Minutes"];
  const proFeatures = ["Everything in Basic", "High Accuracy Mode", "Priority Queue"];

  return (
    <section className="py-12 sm:py-16 px-4 bg-gradient-to-b from-gray-950 to-gray-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 sm:mb-3">
            {t('title')}
          </h2>
          <p className="text-lg sm:text-xl text-gray-300 mb-2">
            {t('subtitle')}
          </p>
          <p className="text-sm sm:text-base text-gray-400">
            {t('description')}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="md:hidden mobile-snap-container mb-8">
          {[0,1,2].map((tierIndex) => {
            const commonClasses = "mobile-snap-card bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors flex-shrink-0";
            if (tierIndex === 2) {
              return (
                <div key={tierIndex} className="mobile-snap-card relative bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-6 hover:border-purple-500/50 transition-colors">
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
                    {proFeatures.map((feature) => (
                      <FeatureItem key={feature} label={feature} />
                    ))}
                  </div>
                </div>
              );
            }

            if (tierIndex === 1) {
              return (
                <div key={tierIndex} className={commonClasses}>
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
                    {basicFeatures.map((feature) => (
                      <FeatureItem key={feature} label={feature} />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={tierIndex} className={commonClasses}>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                  {t('free_tier')}
                </h3>
                <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
                  $0
                </div>
                <div className="text-gray-400 text-sm mb-3 sm:mb-4">
                  {t('free_minutes')}
                </div>
                <div className="space-y-2">
                  {freeFeatures.map((feature) => (
                    <FeatureItem key={feature} label={feature} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {/* Free Tier */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 sm:p-6 hover:border-gray-700 transition-colors">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
              {t('free_tier')}
            </h3>
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
              $0
            </div>
            <div className="text-gray-400 text-sm mb-3 sm:mb-4">
              {t('free_minutes')}
            </div>
            <div className="space-y-2">
              {freeFeatures.map((feature) => (
                <FeatureItem key={feature} label={feature} />
              ))}
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
              {basicFeatures.map((feature) => (
                <FeatureItem key={feature} label={feature} />
              ))}
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
              {proFeatures.map((feature) => (
                <FeatureItem key={feature} label={feature} />
              ))}
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <p className="text-gray-400 mb-4">
            {t('compare_features')}
          </p>
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
