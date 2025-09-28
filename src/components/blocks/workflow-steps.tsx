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
    <section className="py-16 bg-transparent">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">{t("title")}</h2>
          <p className="text-gray-300">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-white/20 to-transparent z-0" />
              )}
              
              <div className="relative z-10">
                <div className="flex flex-col items-center">
                  <div className="relative mb-4">
                    <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center">
                      <step.icon className="w-10 h-10 text-blue-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {step.number}
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-semibold mb-2 text-center text-white">{step.title}</h3>
                  <p className="text-gray-300 text-center mb-4">
                    {step.description}
                  </p>
                  
                  <div className="w-full aspect-video bg-white/5 backdrop-blur-sm rounded-lg overflow-hidden border border-white/10">
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <step.icon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">{step.title}</p>
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