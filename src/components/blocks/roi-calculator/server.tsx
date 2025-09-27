import { RiMoneyDollarCircleLine, RiTimeLine, RiCheckDoubleLine, RiBarChartBoxLine } from "react-icons/ri";

interface Section {
  name: string;
  disabled: boolean;
}

interface ROICalculatorProps {
  section: Section;
  locale: string;
}

const roiContent: Record<string, any> = {
  en: {
    title: "💰 ROI Analysis & Cost Optimization",
    description: "Compare traditional transcription methods vs. V2TX AI solution",
    subtitle: "See how much you can save with our automated transcription",
    scenarios: [
      {
        id: "small",
        title: "Small Creator",
        hours: "10 hours/month",
        traditional: {
          method: "Manual Transcription",
          rate: "$1-2 per minute",
          cost: "$600-1200",
          time: "30-50 hours",
          accuracy: "95-98%"
        },
        freelance: {
          method: "Freelance Service",
          rate: "$0.50-1 per minute",
          cost: "$300-600",
          time: "3-5 days",
          accuracy: "90-95%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "Basic Plan",
          cost: "$10/month",
          time: "20 minutes",
          accuracy: "98.5%",
          savings: "$290-1190"
        }
      },
      {
        id: "business",
        title: "Business User",
        hours: "50 hours/month",
        traditional: {
          method: "Manual Transcription",
          rate: "$1-2 per minute",
          cost: "$3000-6000",
          time: "150-250 hours",
          accuracy: "95-98%"
        },
        freelance: {
          method: "Freelance Service",
          rate: "$0.50-1 per minute",
          cost: "$1500-3000",
          time: "15-25 days",
          accuracy: "90-95%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "Pro Plan",
          cost: "$29/month",
          time: "100 minutes",
          accuracy: "98.5%",
          savings: "$1471-5971"
        }
      },
      {
        id: "enterprise",
        title: "Enterprise",
        hours: "200 hours/month",
        traditional: {
          method: "Manual Transcription",
          rate: "$1-2 per minute",
          cost: "$12000-24000",
          time: "600-1000 hours",
          accuracy: "95-98%"
        },
        freelance: {
          method: "Professional Agency",
          rate: "$0.75-1.5 per minute",
          cost: "$9000-18000",
          time: "30-50 days",
          accuracy: "95-98%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "Enterprise",
          cost: "Custom pricing",
          time: "6-7 hours",
          accuracy: "99%+",
          savings: "$8000-23000"
        }
      }
    ],
    benefits: {
      title: "Additional Benefits",
      items: [
        "Instant results - no waiting for human transcribers",
        "24/7 availability - process videos anytime",
        "Consistent quality - no human errors or fatigue",
        "Multiple export formats included",
        "Built-in editor for refinements",
        "Automatic speaker identification",
        "98+ language support"
      ]
    }
  },
  zh: {
    title: "💰 投资回报率分析与成本优化",
    description: "传统转录方法与V2TX AI解决方案对比",
    subtitle: "了解使用我们的自动转录能节省多少成本",
    scenarios: [
      {
        id: "small",
        title: "小型创作者",
        hours: "10小时/月",
        traditional: {
          method: "人工转录",
          rate: "¥6-12/分钟",
          cost: "¥3600-7200",
          time: "30-50小时",
          accuracy: "95-98%"
        },
        freelance: {
          method: "自由职业服务",
          rate: "¥3-6/分钟",
          cost: "¥1800-3600",
          time: "3-5天",
          accuracy: "90-95%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "基础套餐",
          cost: "¥70/月",
          time: "20分钟",
          accuracy: "98.5%",
          savings: "¥1730-7130"
        }
      },
      {
        id: "business",
        title: "商业用户",
        hours: "50小时/月",
        traditional: {
          method: "人工转录",
          rate: "¥6-12/分钟",
          cost: "¥18000-36000",
          time: "150-250小时",
          accuracy: "95-98%"
        },
        freelance: {
          method: "自由职业服务",
          rate: "¥3-6/分钟",
          cost: "¥9000-18000",
          time: "15-25天",
          accuracy: "90-95%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "专业套餐",
          cost: "¥199/月",
          time: "100分钟",
          accuracy: "98.5%",
          savings: "¥8801-35801"
        }
      },
      {
        id: "enterprise",
        title: "企业用户",
        hours: "200小时/月",
        traditional: {
          method: "人工转录",
          rate: "¥6-12/分钟",
          cost: "¥72000-144000",
          time: "600-1000小时",
          accuracy: "95-98%"
        },
        freelance: {
          method: "专业机构",
          rate: "¥4.5-9/分钟",
          cost: "¥54000-108000",
          time: "30-50天",
          accuracy: "95-98%"
        },
        v2tx: {
          method: "V2TX AI",
          plan: "企业版",
          cost: "定制价格",
          time: "6-7小时",
          accuracy: "99%+",
          savings: "¥50000-140000"
        }
      }
    ],
    benefits: {
      title: "额外优势",
      items: [
        "即时获得结果 - 无需等待人工转录",
        "全天候可用 - 随时处理视频",
        "质量稳定 - 无人为错误或疲劳",
        "包含多种导出格式",
        "内置编辑器用于优化",
        "自动说话人识别",
        "支持98+种语言"
      ]
    }
  }
};

export default function ROICalculatorServer({ section, locale }: ROICalculatorProps) {
  if (section.disabled) {
    return null;
  }

  const t = roiContent[locale] || roiContent.en;

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="design-heading-1 mb-4">
            {t.title}
          </h2>
          <p className="design-description text-lg">
            {t.description}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            {t.subtitle}
          </p>
        </div>

        {/* Preset scenarios */}
        <div className="space-y-12">
          {t.scenarios.map((scenario: any) => (
            <div key={scenario.id} className="roi-scenario">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{scenario.title}</h3>
                <p className="text-purple-400 font-semibold">{scenario.hours}</p>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                {/* Traditional Method */}
                <div className="design-card border-red-500/20">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <RiTimeLine className="w-5 h-5 text-red-400" />
                    </div>
                    <h4 className="font-semibold text-white">{scenario.traditional.method}</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rate:</span>
                      <span className="text-gray-300">{scenario.traditional.rate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Cost:</span>
                      <span className="text-red-400 font-semibold">{scenario.traditional.cost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Time Required:</span>
                      <span className="text-gray-300">{scenario.traditional.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Accuracy:</span>
                      <span className="text-gray-300">{scenario.traditional.accuracy}</span>
                    </div>
                  </div>
                </div>

                {/* Freelance/Agency Method */}
                <div className="design-card border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <RiMoneyDollarCircleLine className="w-5 h-5 text-yellow-400" />
                    </div>
                    <h4 className="font-semibold text-white">{scenario.freelance.method}</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rate:</span>
                      <span className="text-gray-300">{scenario.freelance.rate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Cost:</span>
                      <span className="text-yellow-400 font-semibold">{scenario.freelance.cost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Time Required:</span>
                      <span className="text-gray-300">{scenario.freelance.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Accuracy:</span>
                      <span className="text-gray-300">{scenario.freelance.accuracy}</span>
                    </div>
                  </div>
                </div>

                {/* V2TX Method */}
                <div className="design-card border-green-500/30 bg-gradient-to-br from-green-900/10 to-emerald-900/10 relative" style={{ overflow: 'visible' }}>
                  <div className="absolute -top-2 -right-2 z-50">
                    <span className="inline-block px-3 py-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs font-bold rounded-full shadow-lg whitespace-nowrap">
                      BEST VALUE
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                      <RiCheckDoubleLine className="w-5 h-5 text-green-400" />
                    </div>
                    <h4 className="font-semibold text-white">{scenario.v2tx.method}</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Plan:</span>
                      <span className="text-gray-300">{scenario.v2tx.plan}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Cost:</span>
                      <span className="text-green-400 font-semibold">{scenario.v2tx.cost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Time Required:</span>
                      <span className="text-gray-300">{scenario.v2tx.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Accuracy:</span>
                      <span className="text-gray-300">{scenario.v2tx.accuracy}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-green-500/20">
                      <div className="flex justify-between items-center">
                        <span className="text-green-400 font-semibold">You Save:</span>
                        <span className="text-xl font-bold text-green-400">{scenario.v2tx.savings}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Benefits */}
        <div className="mt-12 design-card bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
          <h3 className="text-xl font-bold text-white mb-6 text-center">{t.benefits.title}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {t.benefits.items.map((item: string, index: number) => (
              <div key={index} className="flex items-center gap-3">
                <RiCheckDoubleLine className="w-5 h-5 text-green-400 flex-shrink-0" />
                <span className="text-gray-300 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}