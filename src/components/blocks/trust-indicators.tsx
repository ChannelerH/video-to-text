"use client";

import { useTranslations } from "next-intl";
import { Film, Users, Globe, Zap } from "lucide-react";

export default function TrustIndicators({ locale }: { locale: string }) {
  const t = useTranslations("trust_indicators");

  const indicators = [
    {
      icon: Film,
      value: "10M+",
      label: t("minutes_transcribed"),
      suffix: t("minutes")
    },
    {
      icon: Users,
      value: "5,000+",
      label: t("active_users"),
      suffix: ""
    },
    {
      icon: Globe,
      value: "95+",
      label: t("supported_languages"),
      suffix: ""
    },
    {
      icon: Zap,
      value: "5",
      label: t("average_processing"),
      suffix: t("minutes")
    }
  ];

  return (
    <section className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {indicators.map((indicator, index) => (
            <div key={index} className="flex items-center justify-center space-x-3">
              <indicator.icon className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <div className="font-bold text-2xl text-white">
                  {indicator.value}
                  {indicator.suffix && (
                    <span className="text-sm font-normal text-gray-400 ml-1">
                      {indicator.suffix}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-400">
                  {indicator.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}