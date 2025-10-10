"use client";

import { useTranslations } from "next-intl";
import { Upload, Cpu, Download } from "lucide-react";
import Image from "next/image";

export default function WorkflowSteps({ locale }: { locale: string }) {
  const t = useTranslations("workflow");

  const steps = [
    {
      icon: Upload,
      number: "1",
      title: t("step1_title"),
      description: t("step1_description"),
      screenshot: "/images/upload-interface.png"
    },
    {
      icon: Cpu,
      number: "2",
      title: t("step2_title"),
      description: t("step2_description"),
      screenshot: "/images/processing-progress.png"
    },
    {
      icon: Download,
      number: "3",
      title: t("step3_title"),
      description: t("step3_description"),
      screenshot: "/images/download-formats.png"
    }
  ];

  return (
    <section id="how-it-works" className="py-12 sm:py-16 bg-transparent">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-white">{t("title")}</h2>
          <p className="text-sm sm:text-base text-gray-300">{t("subtitle")}</p>
        </div>

        {/* Mobile horizontal carousel */}
        <div className="md:hidden mobile-snap-container">
          {steps.map((step, index) => (
            <div key={index} className="mobile-snap-card bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex-shrink-0">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-3">
                  <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center">
                    <step.icon className="w-8 h-8 text-blue-400" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs">
                    {step.number}
                  </div>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{step.title}</h3>
                <p className="text-sm text-gray-300 mb-4">
                  {step.description}
                </p>
                <div className="w-full aspect-video bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <div>
                      <step.icon className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">{step.title}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop grid */}
        <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-white/20 to-transparent z-0" />
              )}

              <div className="relative z-10">
                <div className="flex flex-col items-center">
                  <div className="relative mb-3 sm:mb-4">
                    <div className="w-20 sm:w-24 h-20 sm:h-24 bg-blue-600/20 rounded-full flex items-center justify-center">
                      <step.icon className="w-8 sm:w-10 h-8 sm:h-10 text-blue-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-7 sm:w-8 h-7 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs sm:text-sm">
                      {step.number}
                    </div>
                  </div>

                  <h3 className="text-lg sm:text-xl font-semibold mb-2 text-center text-white">{step.title}</h3>
                  <p className="text-sm sm:text-base text-gray-300 text-center mb-3 sm:mb-4 px-2">
                    {step.description}
                  </p>

                  <div className="w-full aspect-video bg-white/5 backdrop-blur-sm rounded-lg overflow-hidden border border-white/10">
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <step.icon className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-xs sm:text-sm">{step.title}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
