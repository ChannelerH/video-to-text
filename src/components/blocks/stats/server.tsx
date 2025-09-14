import { getTranslations } from "next-intl/server";
import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default async function StatsServer({ section }: { section: SectionType }) {
  const t = await getTranslations('stats');
  
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        {(section.title || section.description || section.label) && (
          <div className="text-center mb-16">
            {section.label && (
              <div className="design-badge inline-block mb-4">
                {section.icon && (
                  <Icon name={section.icon} className="w-5 h-5 mr-2" />
                )}
                {section.label}
              </div>
            )}
            {section.title && (
              <h2 className="design-heading-1 mb-6 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                {section.title}
              </h2>
            )}
            {section.description && (
              <p className="design-description">{section.description}</p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-6">
          {/* Daily Processed */}
          <div className="design-card group hover:border-blue-500/30 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                15,000+
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1">
                {t('daily_processed')}
              </div>
              <div className="text-xs text-gray-500">
                {t('industry_average', {value: '5,000'})}
              </div>
            </div>
          </div>

          {/* Accuracy Rate */}
          <div className="design-card group hover:border-green-500/30 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                98.5%
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1">
                {t('accuracy_rate')}
              </div>
              <div className="text-xs text-gray-500">
                {t('industry_leading')}
              </div>
            </div>
          </div>

          {/* Average Speed */}
          <div className="design-card group hover:border-purple-500/30 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                5x
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1">
                {t('average_speed')}
              </div>
              <div className="text-xs text-gray-500">
                {t('times_faster', {times: '5'})}
              </div>
            </div>
          </div>

          {/* Online Users */}
          <div className="design-card group hover:border-orange-500/30 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                  2,847
                </div>
                <div className="px-2 py-1 bg-green-500/20 rounded-full text-green-400 text-xs font-semibold animate-pulse">
                  {t('live')}
                </div>
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1 mt-2">
                {t('online_users')}
              </div>
              <div className="text-xs text-gray-500">
                {t('competitor_average', {value: '500'})}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}