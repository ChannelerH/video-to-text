"use client";

import { motion } from "framer-motion";
import { useTranslations } from 'next-intl';
import { 
  RiCheckLine,
  RiAlarmWarningLine,
  RiGraduationCapLine,
  RiMicLine,
  RiTeamLine,
  RiNewspaperLine,
  RiVideoLine,
  RiMusicLine,
  RiSpeakLine,
  RiTranslate2,
  RiBookLine,
  RiPercentLine
} from "react-icons/ri";

interface VideoType {
  icon: React.ElementType;
  title: string;
  description: string;
  accuracy: number;
  gradient: string;
}

interface LimitationItem {
  icon: React.ElementType;
  title: string;
  impact: string;
  accuracyLoss: number;
  solution?: string;
}

interface Section {
  name: string;
  disabled: boolean;
}

interface VideoTypesProps {
  section: Section;
}

// These will be populated from translations
const supportedTypes: VideoType[] = [];
const limitations: LimitationItem[] = [];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

export default function VideoTypes({ section }: VideoTypesProps) {
  const t = useTranslations('video_types');
  
  if (section?.disabled) return null;

  // Get supported types data from translations
  const perfectSupportTypes = t.raw('supported_types.types') as Array<{
    title: string;
    description: string;
    accuracy: number;
  }>;

  const limitationFactors = t.raw('limitations.factors') as Array<{
    title: string;
    impact: string;
    accuracyLoss: number;
    solution?: string;
  }>;

  const supportedTypes: VideoType[] = [
    {
      icon: RiGraduationCapLine,
      title: perfectSupportTypes[0]?.title || "Online courses, educational videos",
      description: perfectSupportTypes[0]?.description || "Clear pronunciation, structured content",
      accuracy: perfectSupportTypes[0]?.accuracy || 98,
      gradient: "from-blue-500 to-blue-600"
    },
    {
      icon: RiMicLine,
      title: perfectSupportTypes[1]?.title || "Podcasts, interview programs",
      description: perfectSupportTypes[1]?.description || "Clear audio, natural dialogue",
      accuracy: perfectSupportTypes[1]?.accuracy || 96,
      gradient: "from-purple-500 to-purple-600"
    },
    {
      icon: RiTeamLine,
      title: perfectSupportTypes[2]?.title || "Meeting recordings, webinars",
      description: perfectSupportTypes[2]?.description || "Business dialogue, professional terminology",
      accuracy: perfectSupportTypes[2]?.accuracy || 95,
      gradient: "from-green-500 to-green-600"
    },
    {
      icon: RiNewspaperLine,
      title: perfectSupportTypes[3]?.title || "News, documentaries",
      description: perfectSupportTypes[3]?.description || "Standard language, clear narration",
      accuracy: perfectSupportTypes[3]?.accuracy || 97,
      gradient: "from-orange-500 to-orange-600"
    },
    {
      icon: RiSpeakLine,
      title: perfectSupportTypes[4]?.title || "Single-speaker presentations, TED talks",
      description: perfectSupportTypes[4]?.description || "Presentation style, clear thinking",
      accuracy: perfectSupportTypes[4]?.accuracy || 98,
      gradient: "from-teal-500 to-teal-600"
    },
    {
      icon: RiVideoLine,
      title: perfectSupportTypes[5]?.title || "Vlogs, personal sharing",
      description: perfectSupportTypes[5]?.description || "Casual conversation, relaxed tone",
      accuracy: perfectSupportTypes[5]?.accuracy || 92,
      gradient: "from-pink-500 to-pink-600"
    }
  ];

  const limitations: LimitationItem[] = [
    {
      icon: RiMusicLine,
      title: limitationFactors[0]?.title || "Loud background music",
      impact: limitationFactors[0]?.impact || "Audio mixing interferes with recognition",
      accuracyLoss: limitationFactors[0]?.accuracyLoss || 20,
      solution: limitationFactors[0]?.solution
    },
    {
      icon: RiTeamLine,
      title: limitationFactors[1]?.title || "Multiple people speaking simultaneously",
      impact: limitationFactors[1]?.impact || "Overlapping voices difficult to separate",
      accuracyLoss: limitationFactors[1]?.accuracyLoss || 30,
      solution: limitationFactors[1]?.solution
    },
    {
      icon: RiTranslate2,
      title: limitationFactors[2]?.title || "Strong accents or dialects",
      impact: limitationFactors[2]?.impact || "Pronunciation deviation affects recognition",
      accuracyLoss: limitationFactors[2]?.accuracyLoss || 25,
      solution: limitationFactors[2]?.solution
    },
    {
      icon: RiBookLine,
      title: limitationFactors[3]?.title || "Dense professional terminology",
      impact: limitationFactors[3]?.impact || "Lower recognition rate for specialized vocabulary",
      accuracyLoss: limitationFactors[3]?.accuracyLoss || 15,
      solution: limitationFactors[3]?.solution
    }
  ];

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
            <RiVideoLine />
          </div>
          <h2 className="design-heading-1 mb-6">
            {t('title')}
          </h2>
          <p className="design-description" dangerouslySetInnerHTML={{ __html: t('description') }} />
        </motion.div>

        <div className="space-y-16">
          {/* 完美支持的视频类型 */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-8"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-content text-white text-xl">
                <RiCheckLine className="mx-auto" />
              </div>
              <h3 className="design-heading-2">{t('supported_types.title')}</h3>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={containerVariants}
              className="design-grid design-grid-3"
            >
              {supportedTypes.map((type, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="design-card interactive group"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${type.gradient} flex items-center justify-center text-white text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <type.icon />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-green-400 bg-green-500/20 px-2 py-1 rounded-md">
                          {type.accuracy}% {t('accuracyLabel')}
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${type.accuracy}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: index * 0.1 }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <h4 className="design-heading-4 mb-2 group-hover:text-purple-300 transition-colors">
                    {type.title}
                  </h4>
                  <p className="text-gray-400 text-sm">
                    {type.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* 可能影响准确率的情况 */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-8"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center text-white text-xl">
                <RiAlarmWarningLine className="mx-auto" />
              </div>
              <h3 className="design-heading-2">{t('limitations.title')}</h3>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={containerVariants}
              className="design-grid design-grid-2"
            >
              {limitations.map((limitation, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="design-card group"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 text-2xl flex-shrink-0">
                      <limitation.icon />
                    </div>
                    <div className="flex-1">
                      <h4 className="design-heading-4 mb-2 text-orange-300">
                        {limitation.title}
                      </h4>
                      <p className="text-gray-400 text-sm mb-3">
                        {limitation.impact}
                      </p>
                      {limitation.solution && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          <p className="text-blue-300 text-sm font-medium">
                            💡 {t('solutionLabel')}: {limitation.solution}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">{t('accuracyImpactLabel')}</span>
                      <span className="text-sm font-mono text-orange-400">
                        -{limitation.accuracyLoss}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                        initial={{ width: 0 }}
                        whileInView={{ width: `${limitation.accuracyLoss}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <RiPercentLine className="text-2xl text-blue-400" />
                <h4 className="design-heading-4 text-blue-300">{t('accuracyNote.title')}</h4>
              </div>
              <p className="text-gray-300 leading-relaxed">
                {t('accuracyNote.description')}
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}