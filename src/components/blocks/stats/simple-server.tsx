import { Section as SectionType } from "@/types/blocks/section";

interface StatsData {
  daily_processed: string;
  accuracy_rate: string;
  average_speed: string;
  online_users: string;
}

const statsText: Record<string, StatsData> = {
  en: {
    daily_processed: "Daily Processed",
    accuracy_rate: "Accuracy Rate",
    average_speed: "Average Speed",
    online_users: "Online Users"
  },
  zh: {
    daily_processed: "今日处理",
    accuracy_rate: "准确率",
    average_speed: "平均速度",
    online_users: "在线用户"
  }
};

interface StatsServerProps {
  section: SectionType;
  locale: string;
}

export default function StatsSimpleServer({ section, locale }: StatsServerProps) {
  if (section.disabled) {
    return null;
  }

  const t = statsText[locale] || statsText.en;

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="grid md:grid-cols-4 gap-6">
          {/* Daily Processed */}
          <div className="design-card group hover:border-blue-500/30 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                15,000+
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1">
                {t.daily_processed}
              </div>
              <div className="text-xs text-gray-500">
                (Industry Avg: 5,000)
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
                {t.accuracy_rate}
              </div>
              <div className="text-xs text-gray-500">
                (Industry Leading)
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
                {t.average_speed}
              </div>
              <div className="text-xs text-gray-500">
                5x Faster
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
                  Live
                </div>
              </div>
              <div className="text-gray-400 text-sm font-medium mb-1 mt-2">
                {t.online_users}
              </div>
              <div className="text-xs text-gray-500">
                (Competitor Avg: 500)
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}