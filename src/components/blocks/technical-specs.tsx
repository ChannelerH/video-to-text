"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileVideo, FileAudio, FileText, Clock, HardDrive, Zap } from "lucide-react";

export default function TechnicalSpecs({ locale }: { locale: string }) {
  const t = useTranslations("technical_specs");

  const specs = [
    {
      category: t("input_formats"),
      icon: FileVideo,
      items: ["MP4", "MOV", "AVI", "MKV", "WebM", "MP3", "WAV", "M4A"]
    },
    {
      category: t("output_formats"),
      icon: FileText,
      items: ["TXT", "SRT", "VTT", "PDF", "DOCX", "JSON"]
    },
    {
      category: t("specifications"),
      icon: HardDrive,
      items: [
        `${t("max_file_size")}: 2GB`,
        `${t("max_duration")}: 3 ${t("hours")}`,
        `${t("languages_supported")}: 95+`
      ]
    },
    {
      category: t("performance"),
      icon: Zap,
      items: [
        `${t("processing_speed")}: 1:5`,
        `${t("spec_accuracy")}: 98.5%`,
        `${t("concurrent_files")}: 10`
      ]
    }
  ];

  return (
    <section className="py-16 bg-transparent">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">{t("title")}</h2>
          <p className="text-gray-300">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {specs.map((spec, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow bg-white/5 backdrop-blur-sm border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <spec.icon className="w-5 h-5 text-blue-600" />
                  {spec.category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {spec.items.map((item, idx) => (
                    <div key={idx} className="flex items-center text-sm">
                      <span className="text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}