"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, FileText, ArrowRight, Users, Mic, BookOpen } from "lucide-react";

export default function RealUseCases({ locale }: { locale: string }) {
  const t = useTranslations("use_cases");

  const cases = [
    {
      icon: Users,
      title: t("case1_title"),
      scenario: t("case1_scenario"),
      result: t("case1_result"),
      metrics: {
        time: "5 min",
        accuracy: "98.5%",
        output: "TXT, DOCX"
      },
      badge: t("case1_badge")
    },
    {
      icon: Mic,
      title: t("case2_title"),
      scenario: t("case2_scenario"),
      result: t("case2_result"),
      metrics: {
        time: "3 min",
        accuracy: "99%",
        output: "SRT, VTT"
      },
      badge: t("case2_badge")
    },
    {
      icon: BookOpen,
      title: t("case3_title"),
      scenario: t("case3_scenario"),
      result: t("case3_result"),
      metrics: {
        time: "8 min",
        accuracy: "97%",
        output: "PDF, DOCX"
      },
      badge: t("case3_badge")
    }
  ];

  return (
    <section className="py-16 bg-transparent">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">{t("title")}</h2>
          <p className="text-gray-300">{t("subtitle")}</p>
        </div>

        <div className="md:hidden mobile-snap-container">
          {cases.map((useCase, index) => (
            <Card key={index} className="mobile-snap-card hover:shadow-xl transition-all duration-300 bg-white/5 backdrop-blur-sm border-white/10">
              <CardHeader>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-600/20 rounded-lg">
                    <useCase.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <Badge variant="secondary" className="bg-green-600/20 text-green-400">
                    {useCase.badge}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">{useCase.title}</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-300 mb-2">
                      {useCase.scenario}
                    </p>
                    <div className="flex items-center gap-2 text-blue-400">
                      <ArrowRight className="w-4 h-4" />
                      <p className="font-medium">{useCase.result}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <Clock className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("time")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.time}</p>
                      </div>
                      <div>
                        <FileText className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("case_accuracy")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.accuracy}</p>
                      </div>
                      <div>
                        <FileText className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("format")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.output}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {cases.map((useCase, index) => (
            <Card key={index} className="hover:shadow-xl transition-all duration-300 bg-white/5 backdrop-blur-sm border-white/10">
              <CardHeader>
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-600/20 rounded-lg">
                    <useCase.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <Badge variant="secondary" className="bg-green-600/20 text-green-400">
                    {useCase.badge}
                  </Badge>
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{useCase.title}</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-300 mb-2">
                      {useCase.scenario}
                    </p>
                    <div className="flex items-center gap-2 text-blue-400">
                      <ArrowRight className="w-4 h-4" />
                      <p className="font-medium">{useCase.result}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <Clock className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("time")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.time}</p>
                      </div>
                      <div>
                        <FileText className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("case_accuracy")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.accuracy}</p>
                      </div>
                      <div>
                        <FileText className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                        <p className="text-xs text-gray-400">{t("format")}</p>
                        <p className="font-semibold text-sm text-white">{useCase.metrics.output}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
