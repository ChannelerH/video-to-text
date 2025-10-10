import { 
  RiGraduationCapLine, 
  RiVideoLine, 
  RiBuildingLine, 
  RiSearchEyeLine,
  RiBookOpenLine,
  RiMicLine,
  RiTranslate2,
  RiTeamLine,
  RiZoomInLine,
  RiFileTextLine,
  RiChatQuoteLine,
  RiGlobalLine
} from "react-icons/ri";

interface Section {
  name: string;
  disabled: boolean;
}

interface UseCasesProps {
  section: Section;
  locale: string;
}

const content: Record<string, any> = {
  en: {
    title: "Speech to Text & Video to Text Use Cases - Convert Audio & Video for Any Industry",
    subtitle: "Discover how our speech to text and video to text converter helps professionals transform content daily",
    categories: [
      {
        title: "Education & Training",
        subtitle: "Transform learning content",
        cases: [
          {
            icon: RiGraduationCapLine,
            title: "Convert Online Course Speech to Text",
            description: "Transform lectures for e-learning - make audio content searchable"
          },
          {
            icon: RiBookOpenLine,
            title: "Lecture Transcription to Notes",
            description: "Speech to text for education - convert lectures to study materials instantly"
          },
          {
            icon: RiSearchEyeLine,
            title: "Research Interview Transcription",
            description: "Convert interview audio for analysis - essential for qualitative research"
          }
        ]
      },
      {
        title: "Speech to Text & Video to Text for Content Creation",
        subtitle: "Convert speech to text and video to text to repurpose your content",
        cases: [
          {
            icon: RiVideoLine,
            title: "YouTube Audio Transcription",
            description: "Convert YouTube audio - generate captions with our speech to text tool"
          },
          {
            icon: RiMicLine,
            title: "Podcast Transcripts",
            description: "Convert podcast audio - create show notes automatically"
          },
          {
            icon: RiFileTextLine,
            title: "Social Media Clips",
            description: "Extract quotes - convert audio clips to text for social posts"
          }
        ]
      },
      {
        title: "Business Speech to Text & Video to Text Solutions",
        subtitle: "Convert corporate audio and video to text for productivity",
        cases: [
          {
            icon: RiTeamLine,
            title: "Meeting Minutes Transcription",
            description: "Convert meeting audio automatically - speech to text for documentation"
          },
          {
            icon: RiBuildingLine,
            title: "Training Content Transcription",
            description: "Convert training audio - build searchable knowledge bases"
          },
          {
            icon: RiChatQuoteLine,
            title: "Customer Testimonials",
            description: "Convert customer audio - transform testimonials to text case studies"
          }
        ]
      },
      {
        title: "Media & Journalism",
        subtitle: "Speed up production",
        cases: [
          {
            icon: RiZoomInLine,
            title: "Interview Transcripts",
            description: "Quickly transcribe interviews for articles"
          },
          {
            icon: RiTranslate2,
            title: "Subtitles & Captions",
            description: "Create multilingual subtitles efficiently"
          },
          {
            icon: RiGlobalLine,
            title: "News Coverage",
            description: "Convert press conferences to text"
          }
        ]
      }
    ]
  },
  zh: {
    title: "各行业的视频转文字解决方案",
    subtitle: "受到全球专业人士信赖",
    categories: [
      {
        title: "教育与培训",
        subtitle: "转化学习内容",
        cases: [
          {
            icon: RiGraduationCapLine,
            title: "在线课程",
            description: "为在线学习视频创建可搜索的文字记录"
          },
          {
            icon: RiBookOpenLine,
            title: "课堂笔记",
            description: "将录制的讲座转换为学习材料"
          },
          {
            icon: RiSearchEyeLine,
            title: "研究访谈",
            description: "转录定性研究录音"
          }
        ]
      },
      {
        title: "内容创作",
        subtitle: "重新利用您的视频",
        cases: [
          {
            icon: RiVideoLine,
            title: "YouTube视频",
            description: "生成准确的字幕和描述"
          },
          {
            icon: RiMicLine,
            title: "播客",
            description: "从节目创建节目笔记和博客文章"
          },
          {
            icon: RiFileTextLine,
            title: "社交媒体",
            description: "提取引言和片段用于发布"
          }
        ]
      },
      {
        title: "商业与企业",
        subtitle: "提高生产力",
        cases: [
          {
            icon: RiTeamLine,
            title: "会议纪要",
            description: "自动记录视频会议"
          },
          {
            icon: RiBuildingLine,
            title: "培训视频",
            description: "创建可搜索的知识库"
          },
          {
            icon: RiChatQuoteLine,
            title: "客户评价",
            description: "将视频反馈转换为案例研究"
          }
        ]
      },
      {
        title: "媒体与新闻",
        subtitle: "加速制作",
        cases: [
          {
            icon: RiZoomInLine,
            title: "采访记录",
            description: "快速转录采访用于文章"
          },
          {
            icon: RiTranslate2,
            title: "字幕与标题",
            description: "高效创建多语言字幕"
          },
          {
            icon: RiGlobalLine,
            title: "新闻报道",
            description: "将新闻发布会转换为文字"
          }
        ]
      }
    ]
  }
};

export default function UseCasesServer({ section, locale }: UseCasesProps) {
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