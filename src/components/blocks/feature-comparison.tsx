"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

export default function FeatureComparison({ locale }: { locale: string }) {
  const t = useTranslations("feature_comparison");

  const features = [
    {
      feature: t("price_per_minute"),
      harku: "$0.10",
      rev: "$1.50",
      otter: "$0.20",
      descript: "$0.30"
    },
    {
      feature: t("languages_count"),
      harku: "95+",
      rev: "38",
      otter: "31",
      descript: "23"
    },
    {
      feature: t("offline_files"),
      harku: true,
      rev: true,
      otter: false,
      descript: true
    },
    {
      feature: t("speaker_identification"),
      harku: true,
      rev: true,
      otter: true,
      descript: true
    },
    {
      feature: t("batch_processing"),
      harku: true,
      rev: false,
      otter: false,
      descript: true
    },
    {
      feature: t("no_installation"),
      harku: true,
      rev: true,
      otter: true,
      descript: false
    },
    {
      feature: t("api_access"),
      harku: true,
      rev: true,
      otter: false,
      descript: false
    },
    {
      feature: t("real_time_processing"),
      harku: true,
      rev: false,
      otter: true,
      descript: false
    }
  ];

  const renderCell = (value: string | boolean) => {
    if (typeof value === "boolean") {
      return value ? (
        <Check className="w-5 h-5 text-green-600 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-gray-400 mx-auto" />
      );
    }
    return <span className="font-semibold">{value}</span>;
  };

  return (
    <section className="py-16 bg-transparent">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-white">{t("title")}</h2>
          <p className="text-gray-300">{t("subtitle")}</p>
        </div>

        {/* Desktop Table View (≥640px) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full max-w-6xl mx-auto bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-4 px-4"></th>
                <th className="text-center py-4 px-4">
                  <div className="font-bold text-lg text-blue-600">Harku</div>
                </th>
                <th className="text-center py-4 px-4">
                  <div className="font-semibold text-gray-600">Rev</div>
                </th>
                <th className="text-center py-4 px-4">
                  <div className="font-semibold text-gray-600">Otter.ai</div>
                </th>
                <th className="text-center py-4 px-4">
                  <div className="font-semibold text-gray-600">Descript</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((row, index) => (
                <tr
                  key={index}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    index % 2 === 0 ? "bg-white/3" : ""
                  }`}
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-300">
                    {row.feature}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-blue-600 font-semibold">
                      {renderCell(row.harku)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-gray-400">
                    {renderCell(row.rev)}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-400">
                    {renderCell(row.otter)}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-400">
                    {renderCell(row.descript)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (<640px) */}
        <div className="sm:hidden space-y-6">
          {features.map((row, index) => (
            <div
              key={index}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-4 space-y-3"
            >
              <h3 className="text-base font-semibold text-gray-200 mb-3 pb-2 border-b border-white/10">
                {row.feature}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-3">
                  <div className="text-xs text-blue-400 mb-1 font-medium">Harku</div>
                  <div className="text-blue-600 font-bold flex justify-center">
                    {renderCell(row.harku)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Rev</div>
                  <div className="text-gray-300 flex justify-center">
                    {renderCell(row.rev)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Otter.ai</div>
                  <div className="text-gray-300 flex justify-center">
                    {renderCell(row.otter)}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Descript</div>
                  <div className="text-gray-300 flex justify-center">
                    {renderCell(row.descript)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-gray-400">
            {t("disclaimer")}
          </p>
        </div>
      </div>
    </section>
  );
}