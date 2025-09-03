"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useTranslations } from 'next-intl';
import { 
  RiPlayLine,
  RiTranslate2, 
  RiCodeLine,
  RiTeamLine,
  RiCheckLine,
  RiTimeLine,
  RiSoundModuleLine,
  RiFileTextLine
} from "react-icons/ri";

interface TranscriptItem {
  timestamp: string;
  text: string;
  confidence?: number;
}

interface DemoData {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  inputDesc: string;
  features: string[];
  transcript: TranscriptItem[];
}

interface Section {
  name: string;
  disabled: boolean;
}

interface TranscriptionDemoProps {
  section: Section;
}

// This will be populated from translations
const demoData: DemoData[] = [];

export default function TranscriptionDemo({ section }: TranscriptionDemoProps) {
  const t = useTranslations('transcription_demo');
  const [activeTab, setActiveTab] = useState("english");
  
  if (section?.disabled) return null;

  // Get tabs data from translations
  const tabs = t.raw('tabs') as Array<{
    id: string;
    title: string;
    description: string;
    inputDesc: string;
    features: string[];
    transcript: TranscriptItem[];
  }>;

  const demoData: DemoData[] = [
    {
      id: "english",
      title: tabs[0]?.title || "English Lecture",
      description: tabs[0]?.description || "Technical tutorial video",
      icon: RiPlayLine,
      gradient: "from-blue-500 to-purple-600",
      inputDesc: tabs[0]?.inputDesc || "5-minute technical lecture video",
      features: tabs[0]?.features || [],
      transcript: tabs[0]?.transcript || []
    },
    {
      id: "chinese",
      title: tabs[1]?.title || "Chinese Dialogue",
      description: tabs[1]?.description || "Business meeting discussion",
      icon: RiTranslate2,
      gradient: "from-green-500 to-teal-600",
      inputDesc: tabs[1]?.inputDesc || "10-minute project discussion meeting",
      features: tabs[1]?.features || [],
      transcript: tabs[1]?.transcript || []
    },
    {
      id: "code",
      title: tabs[2]?.title || "Code Tutorial",
      description: tabs[2]?.description || "Programming tutorial video",
      icon: RiCodeLine,
      gradient: "from-purple-500 to-pink-600",
      inputDesc: tabs[2]?.inputDesc || "15-minute Python programming tutorial",
      features: tabs[2]?.features || [],
      transcript: tabs[2]?.transcript || []
    },
    {
      id: "meeting",
      title: tabs[3]?.title || "Multi-speaker",
      description: tabs[3]?.description || "Team discussion meeting",
      icon: RiTeamLine,
      gradient: "from-orange-500 to-red-600",
      inputDesc: tabs[3]?.inputDesc || "20-minute multi-person discussion meeting",
      features: tabs[3]?.features || [],
      transcript: tabs[3]?.transcript || []
    }
  ];

  const activeDemo = demoData.find(demo => demo.id === activeTab) || demoData[0];

  return (
    <section className="design-section">
      <div className="container mx-auto px-4 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="design-icon pulse mx-auto mb-6">
            <RiFileTextLine />
          </div>
          <h2 className="design-heading-1 mb-6">
            {t('title')}
          </h2>
          <p className="design-description" dangerouslySetInnerHTML={{ __html: t('description') }} />
        </motion.div>

        {/* Tab Navigation */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-4 mb-12"
        >
          {demoData.map((demo) => (
            <button
              key={demo.id}
              onClick={() => setActiveTab(demo.id)}
              className={`px-6 py-3 rounded-full font-semibold transition-all duration-300 ${
                activeTab === demo.id
                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg scale-105'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <demo.icon className="text-lg" />
                {demo.title}
              </div>
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="design-grid design-grid-2 gap-8"
          >
            {/* Input Section */}
            <div className="design-card">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${activeDemo.gradient} flex items-center justify-center text-white text-2xl`}>
                  <activeDemo.icon />
                </div>
                <div>
                  <h3 className="design-heading-3 mb-1">{t('inputSection')}</h3>
                  <p className="text-gray-400">{activeDemo.description}</p>
                </div>
              </div>
              
              <div className="bg-white/5 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <RiPlayLine className="text-purple-400" />
                  <span className="text-sm font-semibold text-gray-300">{t('videoInfo')}</span>
                </div>
                <p className="text-white font-medium">{activeDemo.inputDesc}</p>
              </div>

              <div className="space-y-3">
                <h4 className="design-heading-5 text-purple-300 mb-3">{t('transcriptionFeatures')}</h4>
                {activeDemo.features.map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-sm">
                      <RiCheckLine />
                    </div>
                    <span className="text-gray-300">{feature}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Output Section */}
            <div className="design-card">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center text-white text-2xl">
                  <RiFileTextLine />
                </div>
                <div>
                  <h3 className="design-heading-3 mb-1">{t('transcriptionResults')}</h3>
                  <p className="text-gray-400">{t('autoGeneratedTranscript')}</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-white/5 to-white/10 rounded-xl p-6 space-y-4 max-h-96 overflow-y-auto">
                {activeDemo.transcript.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group"
                  >
                    <div className="flex items-start gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2 text-xs font-mono text-purple-300 bg-purple-500/20 px-2 py-1 rounded-md flex-shrink-0">
                        <RiTimeLine className="text-xs" />
                        {item.timestamp}
                      </div>
                      <div className="flex-1">
                        <p className="text-white leading-relaxed group-hover:text-purple-100 transition-colors">
                          {item.text}
                        </p>
                        {item.confidence && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center gap-1 text-xs text-green-400">
                              <RiSoundModuleLine />
                              <span>{t('confidence')}: {item.confidence}%</span>
                            </div>
                            <div className="w-20 h-1 bg-gray-600 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
                                style={{ width: `${item.confidence}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}