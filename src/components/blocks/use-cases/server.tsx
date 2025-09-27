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
    title: "Video to Text Use Cases - Convert Video to Text for Any Industry",
    subtitle: "Discover how our video to text converter helps professionals transform video content to text daily",
    categories: [
      {
        title: "Education & Training",
        subtitle: "Transform learning content",
        cases: [
          {
            icon: RiGraduationCapLine,
            title: "Convert Online Course Videos to Text",
            description: "Transform video to text for e-learning - make video content searchable with video to text conversion"
          },
          {
            icon: RiBookOpenLine,
            title: "Convert Video Lectures to Text Notes",
            description: "Video to text for education - convert lecture videos to text study materials instantly"
          },
          {
            icon: RiSearchEyeLine,
            title: "Research Interview Video to Text",
            description: "Convert interview videos to text for analysis - essential video to text for research"
          }
        ]
      },
      {
        title: "Video to Text for Content Creation",
        subtitle: "Convert video to text to repurpose your content",
        cases: [
          {
            icon: RiVideoLine,
            title: "YouTube Video to Text Conversion",
            description: "Convert YouTube videos to text - generate captions with our video to text tool"
          },
          {
            icon: RiMicLine,
            title: "Podcast Video to Text Transcripts",
            description: "Convert podcast video to text - create show notes from video to text conversion"
          },
          {
            icon: RiFileTextLine,
            title: "Social Media Video to Text",
            description: "Extract video to text quotes - convert video clips to text for social posts"
          }
        ]
      },
      {
        title: "Business Video to Text Solutions",
        subtitle: "Convert corporate videos to text for productivity",
        cases: [
          {
            icon: RiTeamLine,
            title: "Meeting Video to Text Minutes",
            description: "Convert video meetings to text automatically - video to text for documentation"
          },
          {
            icon: RiBuildingLine,
            title: "Training Video to Text Conversion",
            description: "Convert training videos to text - build searchable video to text knowledge bases"
          },
          {
            icon: RiChatQuoteLine,
            title: "Testimonial Video to Text",
            description: "Convert customer video to text - transform video testimonials to text case studies"
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