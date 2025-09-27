interface Section {
  name: string;
  disabled: boolean;
}

interface AudioTranscriptionDemoProps {
  section: Section;
  locale: string;
}

const demoContent: Record<string, any> = {
  en: {
    title: "🎧 Audio to Text Demo - Real Audio to Text Conversion Results",
    description: "See how our audio to text AI accurately converts different audio types to text instantly",
    subtitle: "Experience professional audio to text conversion - from podcasts to interviews, our audio to text handles it all",
    tabs: [
      {
        id: "podcast",
        title: "Podcast Audio to Text",
        audioInfo: {
          duration: "5-minute audio to text conversion",
          speaker: "Single",
          background: "Studio quality",
          format: "MP3 audio to text"
        },
        stats: {
          processingTime: "25 seconds",
          accuracy: "99.2%",
          wordCount: "1,180 words"
        },
        sampleText: `Welcome to today's podcast episode about productivity and time management. I'm your host, and today we'll explore practical strategies for maximizing your daily output while maintaining work-life balance.

Let's start with the most fundamental concept: time blocking. This technique involves dedicating specific blocks of time to particular tasks or types of work. Instead of constantly switching between emails, meetings, and deep work, you allocate uninterrupted periods for each activity.

The key to successful time blocking is being realistic about how long tasks actually take. Most people underestimate the time needed for complex projects and overestimate their available focus time. Start by tracking your activities for a week to understand your patterns.

Another powerful strategy is the two-minute rule. If something takes less than two minutes to complete, do it immediately rather than adding it to your to-do list. This prevents small tasks from accumulating and becoming overwhelming.

Finally, remember that productivity isn't just about doing more—it's about doing what matters most. Prioritize tasks that align with your long-term goals and values, and don't be afraid to say no to requests that don't serve your objectives.`
      },
      {
        id: "interview",
        title: "Interview Audio to Text",
        audioInfo: {
          duration: "10-minute audio to text interview",
          speaker: "Multiple",
          background: "Phone recording",
          format: "WAV audio to text"
        },
        stats: {
          processingTime: "40 seconds",
          accuracy: "97.5%",
          wordCount: "2,250 words"
        },
        sampleText: `Interviewer: Thank you for joining us today. Can you tell us about your experience in the tech industry?

Guest: Absolutely. I've been working in technology for about fifteen years now, starting as a junior developer and working my way up to CTO positions at several startups.

Interviewer: That's quite a journey. What would you say has been the biggest change you've witnessed in the industry?

Guest: Without a doubt, it's the shift toward cloud-native architectures and microservices. When I started, we were still deploying monolithic applications to physical servers. Now everything is containerized, distributed, and scalable.

Interviewer: How has this affected the way teams work together?

Guest: It's completely transformed collaboration. DevOps practices have broken down the traditional silos between development and operations. Teams now own their services end-to-end, from development through deployment and monitoring.

Interviewer: What advice would you give to someone just starting their career in tech?

Guest: Focus on fundamentals rather than chasing every new framework. Understand data structures, algorithms, and system design principles. These concepts remain valuable regardless of which technologies become popular.`
      },
      {
        id: "lecture",
        title: "Lecture Audio to Text",
        audioInfo: {
          duration: "15-minute audio to text lecture",
          speaker: "Single",
          background: "Classroom recording",
          format: "M4A audio to text"
        },
        stats: {
          processingTime: "55 seconds",
          accuracy: "98.8%",
          wordCount: "3,400 words"
        },
        sampleText: `Good morning, class. Today we'll explore the fundamentals of economic theory, specifically focusing on supply and demand dynamics in modern markets.

Let's begin with the law of demand. This principle states that, all else being equal, as the price of a good increases, the quantity demanded decreases. This inverse relationship forms the foundation of consumer behavior analysis.

Consider a practical example: coffee prices. When coffee prices rise, some consumers switch to tea or reduce their consumption. However, for necessities like gasoline, demand is less elastic—people still need to drive to work regardless of price fluctuations.

The law of supply operates in the opposite direction. As prices increase, producers are incentivized to supply more goods to the market. Higher prices mean higher potential profits, encouraging both existing producers to expand production and new producers to enter the market.

Market equilibrium occurs where supply and demand curves intersect. At this point, the quantity supplied equals the quantity demanded, and the market clears efficiently. Any deviation from this equilibrium creates either surplus or shortage, triggering price adjustments.

External factors, known as shifters, can move entire curves rather than just causing movement along them. Demand shifters include changes in income, population, preferences, and prices of substitute goods.`
      },
      {
        id: "meeting",
        title: "Meeting Audio to Text",
        audioInfo: {
          duration: "20-minute audio to text meeting",
          speaker: "Multiple",
          background: "Conference call",
          format: "OGG audio to text"
        },
        stats: {
          processingTime: "70 seconds",
          accuracy: "96.8%",
          wordCount: "4,800 words"
        },
        sampleText: `Project Manager: Let's begin our sprint retrospective. First, what went well this sprint?

Developer 1: The new deployment pipeline worked flawlessly. We reduced deployment time from 45 minutes to just 10 minutes.

Designer: Collaboration between design and development was much smoother. The new component library really helped maintain consistency.

Developer 2: Agreed. Having those reusable components saved us probably 20 hours of development time.

Project Manager: Excellent. Now, what challenges did we face?

Developer 1: We underestimated the complexity of the payment integration. It took three days longer than planned.

QA Engineer: Testing was bottlenecked because we didn't have test data ready. We need to prioritize test data setup in future sprints.

Designer: Some requirements changed mid-sprint, which caused rework. We should lock down requirements during sprint planning.

Project Manager: Good points. What specific actions can we take to improve?

Developer 2: Let's create a spike for complex integrations before committing to timelines.

QA Engineer: I'll work with the team to set up test data generators at the beginning of each sprint.

Project Manager: Perfect. I'll document these action items and we'll review progress in our next retrospective.`
      }
    ]
  },
  zh: {
    title: "🎧 音频转文字真实效果展示",
    description: "看看我们的AI如何准确处理各种类型的音频内容",
    subtitle: "从播客到采访，从讲座到会议录音，完美处理各类音频",
    tabs: [
      {
        id: "podcast",
        title: "播客音频",
        audioInfo: {
          duration: "5分钟播客音频",
          speaker: "单人",
          background: "录音室品质",
          format: "MP3格式"
        },
        stats: {
          processingTime: "25秒",
          accuracy: "99.2%",
          wordCount: "1,180词"
        },
        sampleText: `Welcome to today's podcast episode about productivity and time management. I'm your host, and today we'll explore practical strategies for maximizing your daily output while maintaining work-life balance.

Let's start with the most fundamental concept: time blocking. This technique involves dedicating specific blocks of time to particular tasks or types of work. Instead of constantly switching between emails, meetings, and deep work, you allocate uninterrupted periods for each activity.

The key to successful time blocking is being realistic about how long tasks actually take. Most people underestimate the time needed for complex projects and overestimate their available focus time. Start by tracking your activities for a week to understand your patterns.

Another powerful strategy is the two-minute rule. If something takes less than two minutes to complete, do it immediately rather than adding it to your to-do list. This prevents small tasks from accumulating and becoming overwhelming.

Finally, remember that productivity isn't just about doing more—it's about doing what matters most. Prioritize tasks that align with your long-term goals and values, and don't be afraid to say no to requests that don't serve your objectives.`
      },
      {
        id: "interview",
        title: "采访录音",
        audioInfo: {
          duration: "10分钟采访录音",
          speaker: "多人",
          background: "电话录音",
          format: "WAV格式"
        },
        stats: {
          processingTime: "40秒",
          accuracy: "97.5%",
          wordCount: "2,250词"
        },
        sampleText: `Interviewer: Thank you for joining us today. Can you tell us about your experience in the tech industry?

Guest: Absolutely. I've been working in technology for about fifteen years now, starting as a junior developer and working my way up to CTO positions at several startups.

Interviewer: That's quite a journey. What would you say has been the biggest change you've witnessed in the industry?

Guest: Without a doubt, it's the shift toward cloud-native architectures and microservices. When I started, we were still deploying monolithic applications to physical servers. Now everything is containerized, distributed, and scalable.

Interviewer: How has this affected the way teams work together?

Guest: It's completely transformed collaboration. DevOps practices have broken down the traditional silos between development and operations. Teams now own their services end-to-end, from development through deployment and monitoring.

Interviewer: What advice would you give to someone just starting their career in tech?

Guest: Focus on fundamentals rather than chasing every new framework. Understand data structures, algorithms, and system design principles. These concepts remain valuable regardless of which technologies become popular.`
      },
      {
        id: "lecture",
        title: "讲座录音",
        audioInfo: {
          duration: "15分钟讲座录音",
          speaker: "单人",
          background: "教室录音",
          format: "M4A格式"
        },
        stats: {
          processingTime: "55秒",
          accuracy: "98.8%",
          wordCount: "3,400词"
        },
        sampleText: `Good morning, class. Today we'll explore the fundamentals of economic theory, specifically focusing on supply and demand dynamics in modern markets.

Let's begin with the law of demand. This principle states that, all else being equal, as the price of a good increases, the quantity demanded decreases. This inverse relationship forms the foundation of consumer behavior analysis.

Consider a practical example: coffee prices. When coffee prices rise, some consumers switch to tea or reduce their consumption. However, for necessities like gasoline, demand is less elastic—people still need to drive to work regardless of price fluctuations.

The law of supply operates in the opposite direction. As prices increase, producers are incentivized to supply more goods to the market. Higher prices mean higher potential profits, encouraging both existing producers to expand production and new producers to enter the market.

Market equilibrium occurs where supply and demand curves intersect. At this point, the quantity supplied equals the quantity demanded, and the market clears efficiently. Any deviation from this equilibrium creates either surplus or shortage, triggering price adjustments.

External factors, known as shifters, can move entire curves rather than just causing movement along them. Demand shifters include changes in income, population, preferences, and prices of substitute goods.`
      },
      {
        id: "meeting",
        title: "会议录音",
        audioInfo: {
          duration: "20分钟会议录音",
          speaker: "多人",
          background: "电话会议",
          format: "OGG格式"
        },
        stats: {
          processingTime: "70秒",
          accuracy: "96.8%",
          wordCount: "4,800词"
        },
        sampleText: `Project Manager: Let's begin our sprint retrospective. First, what went well this sprint?

Developer 1: The new deployment pipeline worked flawlessly. We reduced deployment time from 45 minutes to just 10 minutes.

Designer: Collaboration between design and development was much smoother. The new component library really helped maintain consistency.

Developer 2: Agreed. Having those reusable components saved us probably 20 hours of development time.

Project Manager: Excellent. Now, what challenges did we face?

Developer 1: We underestimated the complexity of the payment integration. It took three days longer than planned.

QA Engineer: Testing was bottlenecked because we didn't have test data ready. We need to prioritize test data setup in future sprints.

Designer: Some requirements changed mid-sprint, which caused rework. We should lock down requirements during sprint planning.

Project Manager: Good points. What specific actions can we take to improve?

Developer 2: Let's create a spike for complex integrations before committing to timelines.

QA Engineer: I'll work with the team to set up test data generators at the beginning of each sprint.

Project Manager: Perfect. I'll document these action items and we'll review progress in our next retrospective.`
      }
    ]
  }
};

export default function AudioTranscriptionDemoServer({ section, locale }: AudioTranscriptionDemoProps) {
  if (section.disabled) {
    return null;
  }

  const t = demoContent[locale] || demoContent.en;

  return (
    <section id={section.name} className="design-section bg-gray-950/50">
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

        {/* CSS-only tab system using radio buttons */}
        <div className="transcription-demo-tabs">
          {t.tabs.map((tab: any, index: number) => (
            <input
              key={`radio-${tab.id}`}
              type="radio"
              name="audio-demo-tab"
              id={`audio-demo-tab-${tab.id}`}
              className="demo-tab-radio"
              defaultChecked={index === 0}
            />
          ))}
          
          {/* Tab labels */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {t.tabs.map((tab: any) => (
              <label
                key={`label-${tab.id}`}
                htmlFor={`audio-demo-tab-${tab.id}`}
                className="demo-tab-label px-6 py-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer hover:bg-gray-800 transition-all"
              >
                {tab.title}
              </label>
            ))}
          </div>

          {/* Tab content */}
          {t.tabs.map((tab: any) => (
            <div key={`content-${tab.id}`} className={`demo-tab-content audio-demo-content-${tab.id}`}>
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Left side - Audio info and stats */}
                <div className="space-y-6">
                  <div className="design-card">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Audio to Text Information
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Duration:</span>
                        <span className="text-white">{tab.audioInfo.duration}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Speaker:</span>
                        <span className="text-white">{tab.audioInfo.speaker}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Background:</span>
                        <span className="text-white">{tab.audioInfo.background}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Format:</span>
                        <span className="text-white">{tab.audioInfo.format}</span>
                      </div>
                    </div>
                  </div>

                  <div className="design-card bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
                    <h3 className="text-lg font-semibold text-white mb-4">Audio to Text Processing Stats</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Processing Time:</span>
                        <span className="text-green-400 font-semibold">{tab.stats.processingTime}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Audio to Text Accuracy:</span>
                        <span className="text-blue-400 font-semibold">{tab.stats.accuracy}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Word Count:</span>
                        <span className="text-purple-400 font-semibold">{tab.stats.wordCount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side - Audio to text result */}
                <div className="design-card">
                  <h3 className="text-lg font-semibold text-white mb-4">Audio to Text Result</h3>
                  <div className="bg-gray-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {tab.sampleText}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <style jsx>{`
          .transcription-demo-tabs .demo-tab-radio {
            display: none;
          }
          
          .transcription-demo-tabs .demo-tab-content {
            display: none;
          }
          
          #audio-demo-tab-podcast:checked ~ .audio-demo-content-podcast,
          #audio-demo-tab-interview:checked ~ .audio-demo-content-interview,
          #audio-demo-tab-lecture:checked ~ .audio-demo-content-lecture,
          #audio-demo-tab-meeting:checked ~ .audio-demo-content-meeting {
            display: block;
          }
          
          #audio-demo-tab-podcast:checked ~ div label[for="audio-demo-tab-podcast"],
          #audio-demo-tab-interview:checked ~ div label[for="audio-demo-tab-interview"],
          #audio-demo-tab-lecture:checked ~ div label[for="audio-demo-tab-lecture"],
          #audio-demo-tab-meeting:checked ~ div label[for="audio-demo-tab-meeting"] {
            background: rgb(107 33 168 / 0.3);
            border-color: rgb(168 85 247 / 0.5);
          }
        `}</style>
      </div>
    </section>
  );
}