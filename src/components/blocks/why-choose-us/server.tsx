import { 
  RiRocketLine, 
  RiShieldCheckLine, 
  RiMoneyDollarCircleLine, 
  RiGlobalLine,
  RiTimeLine,
  RiCheckDoubleLine
} from "react-icons/ri";

interface Section {
  name: string;
  disabled: boolean;
}

interface WhyChooseUsProps {
  section: Section;
  locale: string;
}

const content: Record<string, any> = {
  en: {
    title: "Why Choose Harku for Speech to Text & Video to Text?",
    subtitle: "The most trusted speech to text and video to text converter - see why professionals choose our solution",
    features: [
      {
        icon: RiRocketLine,
        title: "Lightning Fast Speech to Text",
        description: "Convert hours of audio in minutes - fastest transcription with optimized AI",
        highlight: "5x faster"
      },
      {
        icon: RiCheckDoubleLine,
        title: "98.5% Accuracy",
        description: "Industry-leading speech to text precision - convert audio with near-perfect accuracy",
        highlight: "Best in class"
      },
      {
        icon: RiGlobalLine,
        title: "98+ Languages Supported",
        description: "Transcribe speech to text in any language - global support for all dialects",
        highlight: "Global coverage"
      },
      {
        icon: RiMoneyDollarCircleLine,
        title: "Affordable Pricing",
        description: "Save 90% on transcription - most cost-effective speech to text service available",
        highlight: "10x cheaper"
      },
      {
        icon: RiShieldCheckLine,
        title: "Secure Processing",
        description: "Your data is encrypted - private speech to text with enterprise security",
        highlight: "Enterprise grade"
      },
      {
        icon: RiTimeLine,
        title: "24/7 Availability",
        description: "Convert audio anytime - instant speech to text processing without waiting",
        highlight: "Always online"
      }
    ]
  },
  zh: {
    title: "为什么选择 Harku？",
    subtitle: "最值得信赖的视频转文字解决方案",
    features: [
      {
        icon: RiRocketLine,
        title: "极速转换",
        description: "通过优化的AI流程，几分钟内转换数小时的视频",
        highlight: "快5倍"
      },
      {
        icon: RiCheckDoubleLine,
        title: "98.5% 准确率",
        description: "采用先进AI模型的行业领先准确率",
        highlight: "同类最佳"
      },
      {
        icon: RiGlobalLine,
        title: "98+ 种语言",
        description: "支持全球所有主要语言和方言",
        highlight: "全球覆盖"
      },
      {
        icon: RiMoneyDollarCircleLine,
        title: "经济实惠",
        description: "相比人工转录服务节省90%成本",
        highlight: "便宜10倍"
      },
      {
        icon: RiShieldCheckLine,
        title: "安全私密",
        description: "您的数据经过加密，绝不与第三方共享",
        highlight: "企业级安全"
      },
      {
        icon: RiTimeLine,
        title: "全天候可用",
        description: "随时处理视频，无需等待人工转录员",
        highlight: "永远在线"
      }
    ]
  }
};

export default function WhyChooseUsServer({ section, locale }: WhyChooseUsProps) {
  if (section.disabled) {
    return null;
  }

  const t = content[locale] || content.en;

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-1 mb-4 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
            {t.title}
          </h2>
          <p className="design-description">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.features.map((feature: any, index: number) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={index}
                className="design-card group hover:border-purple-500/30 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <IconComponent className="w-6 h-6 text-purple-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-400 mb-2">
                      {feature.description}
                    </p>
                    <span className="inline-flex px-2 py-1 bg-purple-500/10 text-purple-400 text-xs font-semibold rounded">
                      {feature.highlight}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}