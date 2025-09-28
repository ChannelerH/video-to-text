import { 
  RiMicLine,
  RiHeadphoneLine,
  RiBuildingLine,
  RiSearchEyeLine,
  RiBookOpenLine,
  RiVoiceAiLine,
  RiTranslate2,
  RiTeamLine,
  RiRecordCircleLine,
  RiFileTextLine,
  RiChatQuoteLine,
  RiGlobalLine
} from "react-icons/ri";

interface Section {
  name: string;
  disabled: boolean;
}

interface AudioUseCasesProps {
  section: Section;
  locale: string;
}

const content: Record<string, any> = {
  en: {
    title: "Audio to Text Use Cases - Convert Audio to Text for Any Industry",
    subtitle: "Discover how our audio to text converter helps professionals transform audio content to text daily",
    categories: [
      {
        title: "Podcasting & Media",
        subtitle: "Transform audio to text content",
        cases: [
          {
            icon: RiMicLine,
            title: "Convert Podcast Audio to Text",
            description: "Transform podcast audio to text for show notes - essential audio to text for podcasters"
          },
          {
            icon: RiHeadphoneLine,
            title: "Convert Music Audio to Text Lyrics",
            description: "Audio to text for music - extract lyrics from audio to text conversion instantly"
          },
          {
            icon: RiRecordCircleLine,
            title: "Radio Show Audio to Text",
            description: "Convert radio audio to text transcripts - perfect audio to text for broadcasters"
          }
        ]
      },
      {
        title: "Audio to Text for Business",
        subtitle: "Convert audio to text for productivity",
        cases: [
          {
            icon: RiVoiceAiLine,
            title: "Voice Memo Audio to Text",
            description: "Convert voice recording audio to text - instant audio to text for notes"
          },
          {
            icon: RiTeamLine,
            title: "Call Recording Audio to Text",
            description: "Convert phone call audio to text - business audio to text documentation"
          },
          {
            icon: RiFileTextLine,
            title: "Dictation Audio to Text",
            description: "Convert dictation audio to text documents - professional audio to text conversion"
          }
        ]
      },
      {
        title: "Research Audio to Text Solutions",
        subtitle: "Convert interview audio to text for analysis",
        cases: [
          {
            icon: RiSearchEyeLine,
            title: "Interview Audio to Text Transcription",
            description: "Convert research interview audio to text - academic audio to text tool"
          },
          {
            icon: RiBookOpenLine,
            title: "Focus Group Audio to Text",
            description: "Convert group discussion audio to text - qualitative audio to text analysis"
          },
          {
            icon: RiChatQuoteLine,
            title: "Survey Response Audio to Text",
            description: "Convert verbal survey audio to text - research audio to text conversion"
          }
        ]
      },
      {
        title: "Content Creation Audio to Text",
        subtitle: "Speed up audio to text production",
        cases: [
          {
            icon: RiRecordCircleLine,
            title: "Webinar Audio to Text",
            description: "Convert webinar audio to text transcripts for SEO"
          },
          {
            icon: RiTranslate2,
            title: "Multilingual Audio to Text",
            description: "Convert foreign language audio to text with translation"
          },
          {
            icon: RiGlobalLine,
            title: "Conference Audio to Text",
            description: "Convert conference audio to text proceedings"
          }
        ]
      }
    ]
  },
  zh: {
    title: "各行业的音频转文字解决方案",
    subtitle: "受到全球专业人士信赖的音频转文字服务",
    categories: [
      {
        title: "播客与媒体",
        subtitle: "转化音频内容",
        cases: [
          {
            icon: RiMicLine,
            title: "播客音频转文字",
            description: "为播客创建节目笔记的音频转文字工具"
          },
          {
            icon: RiHeadphoneLine,
            title: "音乐歌词提取",
            description: "从音乐音频转文字提取歌词"
          },
          {
            icon: RiRecordCircleLine,
            title: "电台节目转写",
            description: "电台音频转文字记录"
          }
        ]
      },
      {
        title: "商务音频转文字",
        subtitle: "提高工作效率",
        cases: [
          {
            icon: RiVoiceAiLine,
            title: "语音备忘录",
            description: "语音录音音频转文字笔记"
          },
          {
            icon: RiTeamLine,
            title: "电话录音转写",
            description: "商务电话音频转文字记录"
          },
          {
            icon: RiFileTextLine,
            title: "口述转写",
            description: "专业口述音频转文字文档"
          }
        ]
      },
      {
        title: "研究音频转文字",
        subtitle: "分析采访内容",
        cases: [
          {
            icon: RiSearchEyeLine,
            title: "采访转录",
            description: "研究采访音频转文字工具"
          },
          {
            icon: RiBookOpenLine,
            title: "焦点小组",
            description: "小组讨论音频转文字分析"
          },
          {
            icon: RiChatQuoteLine,
            title: "调查回复",
            description: "口头调查音频转文字"
          }
        ]
      },
      {
        title: "内容创作",
        subtitle: "加速内容制作",
        cases: [
          {
            icon: RiRecordCircleLine,
            title: "网络研讨会",
            description: "网络研讨会音频转文字用于SEO"
          },
          {
            icon: RiTranslate2,
            title: "多语言转写",
            description: "外语音频转文字带翻译"
          },
          {
            icon: RiGlobalLine,
            title: "会议记录",
            description: "会议音频转文字会议录"
          }
        ]
      }
    ]
  }
};

export default function AudioUseCasesServer({ section, locale }: AudioUseCasesProps) {
  if (section.disabled) {
    return null;
  }

  const t = content[locale] || content.en;

  return (
    <section id={section.name} className="design-section bg-gray-950/50">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-1 mb-4">
            {t.title}
          </h2>
          <p className="design-description">
            {t.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {t.categories.map((category: any, categoryIndex: number) => (
            <div
              key={categoryIndex}
              className="design-card bg-gradient-to-br from-gray-900/50 to-gray-800/30"
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">
                  {category.title}
                </h3>
                <p className="text-sm text-gray-400">
                  {category.subtitle}
                </p>
              </div>
              
              <div className="space-y-4">
                {category.cases.map((useCase: any, index: number) => {
                  const IconComponent = useCase.icon;
                  return (
                    <div
                      key={index}
                      className="flex gap-4 p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <IconComponent className="w-5 h-5 text-purple-400" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">
                          {useCase.title}
                        </h4>
                        <p className="text-sm text-gray-400">
                          {useCase.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
