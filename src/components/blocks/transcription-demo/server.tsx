interface Section {
  name: string;
  disabled: boolean;
}

interface TranscriptionDemoProps {
  section: Section;
  locale: string;
}

const demoContent: Record<string, any> = {
  en: {
    title: "🎬 Video to Text Demo - Real Transcription Results",
    description: "See how our video to text AI accurately converts different video types to text",
    subtitle: "Experience professional video to text conversion - from lectures to meetings, our video to text handles it all",
    tabs: [
      {
        id: "english",
        title: "English Lecture",
        videoInfo: {
          duration: "5-minute video to text conversion",
          speaker: "Single",
          background: "Clean audio",
          accent: "American English"
        },
        stats: {
          processingTime: "30 seconds",
          accuracy: "98.5%",
          wordCount: "1,250 words"
        },
        sampleText: `Welcome to this technical tutorial on machine learning fundamentals. Today, we'll explore the basic concepts of neural networks and how they process information.

First, let's understand what a neural network is. At its core, a neural network is a computational model inspired by the human brain. It consists of interconnected nodes, or neurons, organized in layers.

The input layer receives data, hidden layers process this information through weighted connections, and the output layer produces the final result. Each connection has a weight that determines its importance in the decision-making process.

During training, these weights are adjusted through a process called backpropagation. The network learns by comparing its predictions with actual results and minimizing the error. This iterative process continues until the model achieves satisfactory accuracy.

One key advantage of neural networks is their ability to learn complex patterns automatically. They can identify features in data that might not be obvious to human observers, making them particularly powerful for tasks like image recognition, natural language processing, and predictive analytics.`
      },
      {
        id: "chinese",
        title: "Chinese Dialogue",
        videoInfo: {
          duration: "10-minute meeting video to text",
          speaker: "Multiple",
          background: "Meeting room",
          accent: "Mandarin Chinese"
        },
        stats: {
          processingTime: "45 seconds",
          accuracy: "97.8%",
          wordCount: "2,100 words"
        },
        sampleText: `我们来讨论一下这个项目的进展情况。首先，我想了解一下技术团队的开发进度。

张经理：目前我们已经完成了系统架构的设计，核心功能模块的开发进度达到了70%。前端界面设计也基本完成，正在进行用户体验优化。

李总：很好。那么在测试方面有什么计划吗？我们需要确保产品质量。

王工程师：我们计划下周开始进行第一轮的集成测试。测试团队已经准备好了测试用例，覆盖了所有的核心功能点。预计需要两周时间完成全面测试。

张经理：另外，我们还需要考虑性能优化的问题。目前系统在高并发场景下的表现还需要改进。

李总：这个很重要。我们的目标用户群体很大，必须保证系统的稳定性和响应速度。建议增加一些压力测试的场景。

王工程师：明白了。我会安排团队专门负责性能优化，确保系统能够承受预期的用户负载。`
      },
      {
        id: "code",
        title: "Code Tutorial",
        videoInfo: {
          duration: "15-minute Python programming tutorial",
          speaker: "Single",
          background: "Screen recording",
          accent: "Technical English"
        },
        stats: {
          processingTime: "60 seconds",
          accuracy: "99.1%",
          wordCount: "3,200 words"
        },
        sampleText: `Let's build a simple REST API using Python and FastAPI. I'll walk you through the process step by step.

First, we need to install FastAPI and uvicorn. Open your terminal and run: pip install fastapi uvicorn.

Now, let's create our main application file. Import FastAPI from the fastapi module. Create an instance of the FastAPI class - this will be our application object.

Next, we'll define our first endpoint. Use the decorator @app.get("/") to create a GET route at the root path. The function below this decorator will handle requests to this endpoint.

For our data model, we'll use Pydantic. Create a class that inherits from BaseModel. Define the fields with their types - for example, name as a string, age as an integer, and email as an optional string.

To handle POST requests, use @app.post("/users"). The function should accept a parameter of our Pydantic model type. FastAPI will automatically validate the incoming JSON against our model.

For database operations, we can use SQLAlchemy. Define your database models, create a session, and use it within your endpoint functions. Remember to handle exceptions and close connections properly.

Finally, to run the application, use uvicorn main:app --reload. The reload flag enables hot reloading during development.`
      },
      {
        id: "meeting",
        title: "Multi-speaker",
        videoInfo: {
          duration: "20-minute multi-person discussion",
          speaker: "Multiple",
          background: "Conference room",
          accent: "Mixed accents"
        },
        stats: {
          processingTime: "75 seconds",
          accuracy: "96.5%",
          wordCount: "4,500 words"
        },
        sampleText: `Sarah: Good morning everyone, let's start with the quarterly review. How did we perform in Q3?

John: Overall, we exceeded our targets by 15%. Revenue grew by 22% year-over-year, and we added 45 new enterprise clients.

Maria: That's excellent! The marketing campaigns really paid off. Our lead generation increased by 60%, and the conversion rate improved to 12%.

David: From a product perspective, we launched three major features. User engagement metrics show a 30% increase in daily active users.

Sarah: What about the challenges we faced?

John: Supply chain issues caused some delays in hardware shipments. We're working with alternative suppliers to mitigate this risk.

Maria: Customer support tickets increased by 40%, mainly due to the rapid growth. We're hiring additional support staff and implementing a new ticketing system.

David: Technical debt is becoming a concern. We need to allocate more resources to code refactoring and infrastructure improvements.

Sarah: Good points. Let's prioritize these issues in Q4. David, can you prepare a technical roadmap for the next quarter?

David: Absolutely. I'll have it ready by next week.

Sarah: Perfect. Let's discuss the budget allocations for these initiatives...`
      }
    ]
  },
  zh: {
    title: "🎬 真实转写效果展示",
    description: "看看我们的AI如何准确处理各种类型的视频内容",
    subtitle: "从技术讲座到商务会议，从编程教程到多人讨论",
    tabs: [
      {
        id: "english",
        title: "英文讲座",
        videoInfo: {
          duration: "5分钟技术讲座视频",
          speaker: "单人",
          background: "清晰音频",
          accent: "美式英语"
        },
        stats: {
          processingTime: "30秒",
          accuracy: "98.5%",
          wordCount: "1,250词"
        },
        sampleText: `Welcome to this technical tutorial on machine learning fundamentals. Today, we'll explore the basic concepts of neural networks and how they process information.

First, let's understand what a neural network is. At its core, a neural network is a computational model inspired by the human brain. It consists of interconnected nodes, or neurons, organized in layers.

The input layer receives data, hidden layers process this information through weighted connections, and the output layer produces the final result. Each connection has a weight that determines its importance in the decision-making process.

During training, these weights are adjusted through a process called backpropagation. The network learns by comparing its predictions with actual results and minimizing the error. This iterative process continues until the model achieves satisfactory accuracy.

One key advantage of neural networks is their ability to learn complex patterns automatically. They can identify features in data that might not be obvious to human observers, making them particularly powerful for tasks like image recognition, natural language processing, and predictive analytics.`
      },
      {
        id: "chinese",
        title: "中文对话",
        videoInfo: {
          duration: "10分钟项目讨论会议",
          speaker: "多人",
          background: "会议室",
          accent: "普通话"
        },
        stats: {
          processingTime: "45秒",
          accuracy: "97.8%",
          wordCount: "2,100字"
        },
        sampleText: `我们来讨论一下这个项目的进展情况。首先，我想了解一下技术团队的开发进度。

张经理：目前我们已经完成了系统架构的设计，核心功能模块的开发进度达到了70%。前端界面设计也基本完成，正在进行用户体验优化。

李总：很好。那么在测试方面有什么计划吗？我们需要确保产品质量。

王工程师：我们计划下周开始进行第一轮的集成测试。测试团队已经准备好了测试用例，覆盖了所有的核心功能点。预计需要两周时间完成全面测试。

张经理：另外，我们还需要考虑性能优化的问题。目前系统在高并发场景下的表现还需要改进。

李总：这个很重要。我们的目标用户群体很大，必须保证系统的稳定性和响应速度。建议增加一些压力测试的场景。

王工程师：明白了。我会安排团队专门负责性能优化，确保系统能够承受预期的用户负载。`
      },
      {
        id: "code",
        title: "代码教程",
        videoInfo: {
          duration: "15分钟Python编程教程",
          speaker: "单人",
          background: "屏幕录制",
          accent: "技术英语"
        },
        stats: {
          processingTime: "60秒",
          accuracy: "99.1%",
          wordCount: "3,200词"
        },
        sampleText: `Let's build a simple REST API using Python and FastAPI. I'll walk you through the process step by step.

First, we need to install FastAPI and uvicorn. Open your terminal and run: pip install fastapi uvicorn.

Now, let's create our main application file. Import FastAPI from the fastapi module. Create an instance of the FastAPI class - this will be our application object.

Next, we'll define our first endpoint. Use the decorator @app.get("/") to create a GET route at the root path. The function below this decorator will handle requests to this endpoint.

For our data model, we'll use Pydantic. Create a class that inherits from BaseModel. Define the fields with their types - for example, name as a string, age as an integer, and email as an optional string.

To handle POST requests, use @app.post("/users"). The function should accept a parameter of our Pydantic model type. FastAPI will automatically validate the incoming JSON against our model.

For database operations, we can use SQLAlchemy. Define your database models, create a session, and use it within your endpoint functions. Remember to handle exceptions and close connections properly.

Finally, to run the application, use uvicorn main:app --reload. The reload flag enables hot reloading during development.`
      },
      {
        id: "meeting",
        title: "多人会议",
        videoInfo: {
          duration: "20分钟多人讨论",
          speaker: "多人",
          background: "会议室",
          accent: "混合口音"
        },
        stats: {
          processingTime: "75秒",
          accuracy: "96.5%",
          wordCount: "4,500词"
        },
        sampleText: `Sarah: Good morning everyone, let's start with the quarterly review. How did we perform in Q3?

John: Overall, we exceeded our targets by 15%. Revenue grew by 22% year-over-year, and we added 45 new enterprise clients.

Maria: That's excellent! The marketing campaigns really paid off. Our lead generation increased by 60%, and the conversion rate improved to 12%.

David: From a product perspective, we launched three major features. User engagement metrics show a 30% increase in daily active users.

Sarah: What about the challenges we faced?

John: Supply chain issues caused some delays in hardware shipments. We're working with alternative suppliers to mitigate this risk.

Maria: Customer support tickets increased by 40%, mainly due to the rapid growth. We're hiring additional support staff and implementing a new ticketing system.

David: Technical debt is becoming a concern. We need to allocate more resources to code refactoring and infrastructure improvements.

Sarah: Good points. Let's prioritize these issues in Q4. David, can you prepare a technical roadmap for the next quarter?

David: Absolutely. I'll have it ready by next week.

Sarah: Perfect. Let's discuss the budget allocations for these initiatives...`
      }
    ]
  }
};

export default function TranscriptionDemoServer({ section, locale }: TranscriptionDemoProps) {
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
              name="demo-tab"
              id={`demo-tab-${tab.id}`}
              className="demo-tab-radio"
              defaultChecked={index === 0}
            />
          ))}
          
          {/* Tab labels */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {t.tabs.map((tab: any) => (
              <label
                key={`label-${tab.id}`}
                htmlFor={`demo-tab-${tab.id}`}
                className="demo-tab-label px-6 py-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer hover:bg-gray-800 transition-all"
              >
                {tab.title}
              </label>
            ))}
          </div>

          {/* Tab content */}
          {t.tabs.map((tab: any) => (
            <div key={`content-${tab.id}`} className={`demo-tab-content demo-content-${tab.id}`}>
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Left side - Video info and stats */}
                <div className="space-y-6">
                  <div className="design-card">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                      Video Information
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Duration:</span>
                        <span className="text-white">{tab.videoInfo.duration}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Speaker:</span>
                        <span className="text-white">{tab.videoInfo.speaker}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Background:</span>
                        <span className="text-white">{tab.videoInfo.background}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Accent:</span>
                        <span className="text-white">{tab.videoInfo.accent}</span>
                      </div>
                    </div>
                  </div>

                  <div className="design-card bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-500/30">
                    <h3 className="text-lg font-semibold text-white mb-4">Processing Stats</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Processing Time:</span>
                        <span className="text-green-400 font-semibold">{tab.stats.processingTime}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Accuracy:</span>
                        <span className="text-blue-400 font-semibold">{tab.stats.accuracy}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Word Count:</span>
                        <span className="text-purple-400 font-semibold">{tab.stats.wordCount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side - Transcription result */}
                <div className="design-card">
                  <h3 className="text-lg font-semibold text-white mb-4">Transcription Result</h3>
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
      </div>
    </section>
  );
}