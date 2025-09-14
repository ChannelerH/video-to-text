import { Section as SectionType } from "@/types/blocks/section";
import { RiQuestionLine, RiAddLine } from "react-icons/ri";

interface FAQServerProps {
  section: SectionType;
  locale: string;
}

const faqContent: Record<string, any> = {
  en: {
    title: "Frequently Asked Questions",
    description: "Everything you need to know about our video to text service",
    items: [
      {
        question: "How accurate is the transcription?",
        answer: "Our AI-powered transcription achieves 98.5% accuracy for clear audio. The accuracy may vary based on audio quality, background noise, and accents. We use advanced models like OpenAI Whisper and Deepgram for the best results."
      },
      {
        question: "What video formats are supported?",
        answer: "We support all major video formats including MP4, MOV, AVI, MKV, WebM, and more. You can also paste YouTube URLs directly. Maximum file size is 2GB for Pro users."
      },
      {
        question: "How long does transcription take?",
        answer: "Most videos are transcribed in less than 5 minutes. A 30-minute video typically takes 1-2 minutes. Longer videos may take proportionally more time, but we're 5x faster than real-time."
      },
      {
        question: "Can I edit the transcription?",
        answer: "Yes! Our built-in editor allows you to review and edit transcriptions. You can adjust timestamps, correct words, and format the text. All changes are saved automatically."
      },
      {
        question: "What languages are supported?",
        answer: "We support 98+ languages including English, Chinese, Spanish, French, German, Japanese, Korean, and many more. The system automatically detects the language of your video."
      },
      {
        question: "Is my data secure?",
        answer: "Absolutely. All uploads are encrypted with SSL/TLS. Your files are processed securely and deleted from our servers after 30 days (or immediately upon request). We never share your data with third parties."
      },
      {
        question: "Can I export subtitles?",
        answer: "Yes! You can export in multiple formats including SRT, VTT, TXT, JSON, and for Pro users, PDF and DOCX. The subtitle formats include proper timestamps for video editors."
      },
      {
        question: "Do you offer API access?",
        answer: "API access is available for Pro and Enterprise users. You can integrate our transcription service directly into your workflow with our RESTful API."
      }
    ]
  },
  zh: {
    title: "常见问题",
    description: "关于我们视频转文字服务的所有信息",
    items: [
      {
        question: "转录的准确率如何？",
        answer: "我们的AI转录对于清晰音频可达到98.5%的准确率。准确率可能因音频质量、背景噪音和口音而有所不同。我们使用OpenAI Whisper和Deepgram等先进模型以获得最佳效果。"
      },
      {
        question: "支持哪些视频格式？",
        answer: "我们支持所有主要视频格式，包括MP4、MOV、AVI、MKV、WebM等。您也可以直接粘贴YouTube网址。Pro用户的最大文件大小为2GB。"
      },
      {
        question: "转录需要多长时间？",
        answer: "大多数视频在5分钟内完成转录。30分钟的视频通常需要1-2分钟。较长的视频可能需要更多时间，但我们的速度是实时的5倍。"
      },
      {
        question: "我可以编辑转录内容吗？",
        answer: "可以！我们的内置编辑器允许您审查和编辑转录内容。您可以调整时间戳、纠正单词并格式化文本。所有更改都会自动保存。"
      },
      {
        question: "支持哪些语言？",
        answer: "我们支持98种以上的语言，包括英语、中文、西班牙语、法语、德语、日语、韩语等。系统会自动检测视频的语言。"
      },
      {
        question: "我的数据安全吗？",
        answer: "绝对安全。所有上传都使用SSL/TLS加密。您的文件安全处理，30天后从我们的服务器删除（或根据要求立即删除）。我们绝不与第三方共享您的数据。"
      },
      {
        question: "可以导出字幕吗？",
        answer: "可以！您可以导出多种格式，包括SRT、VTT、TXT、JSON，Pro用户还可以导出PDF和DOCX。字幕格式包含适用于视频编辑器的正确时间戳。"
      },
      {
        question: "提供API访问吗？",
        answer: "API访问适用于Pro和企业用户。您可以通过我们的RESTful API将转录服务直接集成到您的工作流程中。"
      }
    ]
  }
};

export default function FAQServer({ section, locale }: FAQServerProps) {
  if (section.disabled) {
    return null;
  }

  const t = faqContent[locale] || faqContent.en;

  return (
    <section id={section.name} className="design-section">
      <div className="container max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="design-icon pulse mx-auto mb-6">
            <RiQuestionLine />
          </div>
          <h2 className="design-heading-2">{t.title}</h2>
          <p className="design-description">
            {t.description}
          </p>
        </div>
        
        <div className="space-y-4">
          {t.items.map((item: any, index: number) => (
            <details
              key={index}
              className="group design-card border-l-4 border-l-purple-500/30"
            >
              <summary className="flex items-center justify-between cursor-pointer p-6 hover:bg-gray-800/30 transition-colors list-none">
                <h3 className="font-semibold text-white pr-4">
                  {item.question}
                </h3>
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center group-open:rotate-45 transition-transform">
                  <RiAddLine className="w-4 h-4 text-purple-400" />
                </div>
              </summary>
              <div className="px-6 pb-6">
                <p className="text-gray-400 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}