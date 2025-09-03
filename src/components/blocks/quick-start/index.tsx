"use client";

import { motion } from "framer-motion";
import { useTranslations } from 'next-intl';
import { 
  RiUploadCloudLine,
  RiTranslate2,
  RiPlayLine,
  RiDownloadLine,
  RiLightbulbLine,
  RiVideoLine,
  RiFileTextLine,
  RiTimeLine,
  RiVipCrownLine,
  RiSpeedUpLine,
  RiTeamLine,
  RiArrowRightLine
} from "react-icons/ri";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  details: string[];
}

interface Tip {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface Section {
  name: string;
  disabled: boolean;
}

interface QuickStartProps {
  section: Section;
}

// These will be populated from translations
const steps: Step[] = [];
const tips: Tip[] = [];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

const stepVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

const tipVariants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

export default function QuickStart({ section }: QuickStartProps) {
  const t = useTranslations('quick_start');
  
  if (section?.disabled) return null;

  // Get steps data from translations
  const stepsData = t.raw('steps') as Array<{
    title: string;
    description: string;
    details: string[];
  }>;

  const tipsData = t.raw('tips.list') as Array<{
    title: string;
    description: string;
  }>;

  const steps: Step[] = [
    {
      number: "1️⃣",
      title: stepsData[0]?.title || "Upload Video",
      description: stepsData[0]?.description || "Drag files or paste links",
      icon: RiUploadCloudLine,
      gradient: "from-blue-500 to-cyan-600",
      details: stepsData[0]?.details || []
    },
    {
      number: "2️⃣", 
      title: stepsData[1]?.title || "Select Language (Optional)",
      description: stepsData[1]?.description || "Auto-detect or manual selection",
      icon: RiTranslate2,
      gradient: "from-purple-500 to-pink-600",
      details: stepsData[1]?.details || []
    },
    {
      number: "3️⃣",
      title: stepsData[2]?.title || "Click Transcribe",
      description: stepsData[2]?.description || "View progress in real-time",
      icon: RiPlayLine,
      gradient: "from-green-500 to-emerald-600",
      details: stepsData[2]?.details || []
    },
    {
      number: "4️⃣",
      title: stepsData[3]?.title || "Download Results",
      description: stepsData[3]?.description || "Choose your preferred format",
      icon: RiDownloadLine,
      gradient: "from-orange-500 to-red-600",
      details: stepsData[3]?.details || []
    }
  ];

  const tips: Tip[] = [
    {
      icon: RiVideoLine,
      title: tipsData[0]?.title || "Clearer video, higher accuracy",
      description: tipsData[0]?.description || "Recommend using high-quality audio source, avoid background noise interference"
    },
    {
      icon: RiVipCrownLine,
      title: tipsData[1]?.title || "Can test with free quota first",
      description: tipsData[1]?.description || "90-second free preview, purchase full service when satisfied"
    },
    {
      icon: RiSpeedUpLine,
      title: tipsData[2]?.title || "Batch processing saves more time",
      description: tipsData[2]?.description || "Support simultaneous upload of multiple files, batch transcription more efficient"
    },
    {
      icon: RiTeamLine,
      title: tipsData[3]?.title || "Multi-user collaboration feature",
      description: tipsData[3]?.description || "Support team project sharing, collaborative editing of transcription results"
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
            <RiPlayLine />
          </div>
          <h2 className="design-heading-1 mb-6">
            {t('title')}
          </h2>
          <p className="design-description" dangerouslySetInnerHTML={{ __html: t('description') }} />
        </motion.div>

        {/* Steps */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="mb-16"
        >
          <div className="grid lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                variants={stepVariants}
                className="relative"
              >
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-20 left-full w-8 h-0.5 bg-gradient-to-r from-purple-500 to-transparent z-10">
                    <motion.div
                      className="w-full h-full bg-gradient-to-r from-purple-400 to-blue-400"
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: 0.3 + index * 0.2 }}
                    />
                  </div>
                )}

                <div className="design-card interactive text-center h-full group">
                  <div className="mb-6">
                    <div className={`w-20 h-20 rounded-3xl bg-gradient-to-r ${step.gradient} flex items-center justify-center text-white text-3xl mx-auto mb-4 shadow-2xl group-hover:scale-110 transition-transform duration-300`}>
                      <step.icon />
                    </div>
                    <div className="text-3xl mb-2">{step.number}</div>
                    <h3 className="design-heading-3 mb-2 group-hover:text-purple-300 transition-colors">
                      {step.title}
                    </h3>
                    <p className="text-gray-400 text-sm">{step.description}</p>
                  </div>

                  <div className="space-y-2 text-left">
                    {step.details.map((detail, detailIndex) => (
                      <motion.div
                        key={detailIndex}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ 
                          duration: 0.4, 
                          delay: 0.5 + index * 0.1 + detailIndex * 0.05 
                        }}
                        className="flex items-start gap-2 text-sm"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-purple-400 to-blue-400 mt-2 flex-shrink-0" />
                        <span className="text-gray-300 leading-relaxed">{detail}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Professional Tips */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 justify-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 flex items-center justify-center text-white text-xl">
              <RiLightbulbLine />
            </div>
            <h3 className="design-heading-2">{t('tips.title')}</h3>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={containerVariants}
            className="design-grid design-grid-2 gap-6"
          >
            {tips.map((tip, index) => (
              <motion.div
                key={index}
                variants={tipVariants}
                className="design-card group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 text-xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <tip.icon />
                  </div>
                  <div className="flex-1">
                    <h4 className="design-heading-5 mb-2 text-purple-300 group-hover:text-purple-200 transition-colors">
                      {tip.title}
                    </h4>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      {tip.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center"
        >
          <div className="design-card featured max-w-3xl mx-auto">
            <div className="mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-white text-4xl mx-auto mb-4 shadow-2xl">
                <RiPlayLine />
              </div>
              <h3 className="design-heading-2 mb-4">{t('cta_section.title')}</h3>
              <p className="text-gray-300 mb-6 leading-relaxed" dangerouslySetInnerHTML={{ __html: t('cta_section.description') }} />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="design-btn-primary enhanced"
              >
                <RiUploadCloudLine />
                {t('cta_section.upload_btn')}
                <RiArrowRightLine />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="design-btn-secondary"
              >
                <RiPlayLine />
                {t('cta_section.demo_btn')}
              </motion.button>
            </div>

            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-400">
              {(t.raw('cta_section.features') as Array<{ label: string; }>).map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  {index === 0 && <RiTimeLine className="text-green-400" />}
                  {index === 1 && <RiFileTextLine className="text-blue-400" />}
                  {index === 2 && <RiSpeedUpLine className="text-purple-400" />}
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}