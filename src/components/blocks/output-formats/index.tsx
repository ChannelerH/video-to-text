"use client";

import { motion } from "framer-motion";
import { useTranslations } from 'next-intl';
import { 
  RiFileTextLine,
  RiCodeBoxLine,
  RiDownloadLine,
  RiVideoLine,
  RiEditLine,
  RiSearchLine,
  RiShareLine,
  RiSettings4Line,
  RiTimeLine,
  RiBarChartBoxLine,
  RiToolsLine,
  RiCloudLine
} from "react-icons/ri";
import { SiYoutube, SiVimeo } from "react-icons/si";

interface FormatFeature {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface OutputFormat {
  name: string;
  extensions: string[];
  icon: React.ElementType;
  gradient: string;
  category: string;
  description: string;
  features: FormatFeature[];
  platforms: string[];
  useCase: string;
}

interface Section {
  name: string;
  disabled: boolean;
}

interface OutputFormatsProps {
  section: Section;
}

// This will be populated from translations
const outputFormats: OutputFormat[] = [];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

const cardVariants = {
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

const featureVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4
    }
  }
};

export default function OutputFormats({ section }: OutputFormatsProps) {
  const t = useTranslations('output_formats');
  
  if (section?.disabled) return null;
  
  // Safe translation function with fallbacks
  const safeT = (key: string, fallback: string = key) => {
    try {
      return t(key as any) || fallback;
    } catch {
      return fallback;
    }
  };
  
  const safeRaw = (key: string, fallback: any = []) => {
    try {
      const result = t.raw(key as any);
      return Array.isArray(result) ? result : fallback;
    } catch {
      return fallback;
    }
  };

  // Get categories data from translations with fallback
  let categoriesData: Array<{
    title: string;
    subtitle: string;
    description: string;
    formats: Array<{
      name: string;
      description: string;
      features: string[];
      platforms: string[];
      tip: string;
    }>;
  }> = [];
  
  try {
    categoriesData = t.raw('categories') as typeof categoriesData;
    if (!Array.isArray(categoriesData)) {
      categoriesData = [];
    }
  } catch {
    categoriesData = [];
  }

  const outputFormats: OutputFormat[] = [
    {
      name: categoriesData[0]?.title || "Subtitle Formats",
      extensions: ["SRT", "VTT", "ASS"],
      icon: RiVideoLine,
      gradient: "from-red-500 to-pink-600",
      category: "subtitle",
      description: categoriesData[0]?.description || "For video production and publishing",
      useCase: "Video editing, subtitle creation, online playback",
      features: (categoriesData[0]?.formats || []).map((format, index) => ({
        icon: [SiYoutube, RiVideoLine, RiSettings4Line, RiTimeLine][index] || SiYoutube,
        title: format.name,
        description: format.description
      })),
      platforms: categoriesData[0]?.formats?.flatMap(f => f.platforms || []) || []
    },
    {
      name: categoriesData[1]?.title || "Document Formats",
      extensions: ["DOCX", "PDF", "TXT"],
      icon: RiFileTextLine,
      gradient: "from-blue-500 to-cyan-600",
      category: "document",
      description: categoriesData[1]?.description || "For editing and sharing",
      useCase: "Document editing, content creation, note organization",
      features: (categoriesData[1]?.formats || []).map((format, index) => ({
        icon: [RiEditLine, RiSearchLine, RiShareLine, RiCloudLine][index] || RiEditLine,
        title: format.name,
        description: format.description
      })),
      platforms: categoriesData[1]?.formats?.flatMap(f => f.platforms || []) || []
    },
    {
      name: categoriesData[2]?.title || "Data Formats",
      extensions: ["JSON", "CSV", "XML"],
      icon: RiCodeBoxLine,
      gradient: "from-green-500 to-emerald-600",
      category: "data",
      description: categoriesData[2]?.description || "For analysis and processing",
      useCase: "API integration, data analysis, automated processing",
      features: (categoriesData[2]?.formats || []).map((format, index) => ({
        icon: [RiTimeLine, RiBarChartBoxLine, RiToolsLine, RiSettings4Line][index] || RiTimeLine,
        title: format.name,
        description: format.description
      })),
      platforms: categoriesData[2]?.formats?.flatMap(f => f.platforms || []) || []
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
            <RiDownloadLine />
          </div>
          <h2 className="design-heading-1 mb-6">
            📄 Export Formats and Their Uses
          </h2>
          <p className="design-description">Multiple professional formats for different needs<br />From video production to document editing, from API integration to data analysis</p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="space-y-12"
        >
          {outputFormats.map((format, formatIndex) => (
            <motion.div
              key={formatIndex}
              variants={cardVariants}
              className="design-card"
            >
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Format Header */}
                <div className="lg:col-span-1">
                  <div className="flex items-center gap-4 mb-4">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${format.gradient} flex items-center justify-center text-white text-3xl shadow-lg`}>
                      <format.icon />
                    </div>
                    <div>
                      <h3 className="design-heading-3 mb-1">{format.name}</h3>
                      <div className="flex flex-wrap gap-2">
                        {format.extensions.map((ext, index) => (
                          <span 
                            key={index}
                            className="text-xs font-mono bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 px-2 py-1 rounded-md border border-purple-500/30"
                          >
                            .{ext}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    {format.description}
                  </p>
                  
                  <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-4 border border-blue-500/20">
                    <h5 className="design-heading-5 text-blue-300 mb-2">Main Usage</h5>
                    <p className="text-blue-100 text-sm">{format.useCase}</p>
                  </div>
                </div>

                {/* Features */}
                <div className="lg:col-span-1">
                  <h4 className="design-heading-4 mb-4 text-purple-300">🎯 Core Features</h4>
                  <div className="space-y-3">
                    {format.features.map((feature, featureIndex) => (
                      <motion.div
                        key={featureIndex}
                        variants={featureVariants}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500/20 to-blue-500/20 flex items-center justify-center text-purple-300 text-sm flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          <feature.icon />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-white font-semibold text-sm mb-1 group-hover:text-purple-300 transition-colors">
                            {feature.title}
                          </h5>
                          <p className="text-gray-400 text-xs leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Compatible Platforms */}
                <div className="lg:col-span-1">
                  <h4 className="design-heading-4 mb-4 text-green-300">📱 Compatible Platforms</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {format.platforms.map((platform, platformIndex) => (
                      <motion.div
                        key={platformIndex}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ 
                          duration: 0.3, 
                          delay: platformIndex * 0.05 
                        }}
                        className="flex items-center gap-2 p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-sm"
                      >
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="text-gray-300">{platform}</span>
                      </motion.div>
                    ))}
                  </div>
                  
                  <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <RiSettings4Line className="text-green-400" />
                      <span className="text-green-300 font-semibold text-sm">Professional Tip</span>
                    </div>
                    <p className="text-green-100 text-xs leading-relaxed">
                      {(format.category === 'subtitle' && "Choose SRT for universal compatibility, VTT for more styles, ASS for complex subtitle effects") ||
                       (format.category === 'document' && "DOCX format preserves formatting, TXT is most universal, MD format suitable for technical documentation") ||
                       (format.category === 'data' && "JSON format most flexible, CSV format suitable for data analysis, XML format suitable for enterprise integration") ||
                       "Professional format for your needs"}
                    </p>
                  </div>
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
          className="mt-12 p-8 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl text-center"
        >
          <h4 className="design-heading-3 mb-4 text-purple-300">🎯 Selection Recommendations</h4>
          <div className="grid md:grid-cols-3 gap-6 text-left">
            {[
              { title: "Video Producers", description: "Recommend SRT/VTT formats, direct use in editing software" },
              { title: "Content Creators", description: "Recommend DOCX/MD formats, convenient for editing and publishing" },
              { title: "Developers", description: "Recommend JSON/CSV formats, convenient for programmatic processing" }
            ].map((item, index) => (
              <div key={index} className="space-y-2">
                <h5 className="font-semibold text-white">{item.title}</h5>
                <p className="text-gray-300 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}