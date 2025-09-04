"use client";

import { motion } from "framer-motion";
import { useTranslations } from 'next-intl';
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

interface UseCaseItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface UseCaseCategory {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  gradient: string;
  cases: UseCaseItem[];
}

interface Section {
  name: string;
  disabled: boolean;
}

interface UseCasesProps {
  section: Section;
}

// This will be populated from translations
const useCaseCategories: UseCaseCategory[] = [];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const categoryVariants = {
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

const caseVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

export default function UseCases({ section }: UseCasesProps) {
  const t = useTranslations('use_cases');
  
  if (section?.disabled) return null;

  // Get categories data from translations
  const categories = t.raw('categories') as Array<{
    title: string;
    subtitle: string;
    cases: Array<{ title: string; description: string; }>;
  }>;

  const useCaseCategories: UseCaseCategory[] = [
    {
      title: categories[0]?.title || "Education",
      subtitle: categories[0]?.subtitle || "30% of educational institutions are using",
      icon: RiGraduationCapLine,
      gradient: "from-blue-500 to-purple-600",
      cases: (categories[0]?.cases || []).map((item, index) => ({
        icon: [RiBookOpenLine, RiMicLine, RiTranslate2][index] || RiBookOpenLine,
        title: item.title,
        description: item.description
      }))
    },
    {
      title: categories[1]?.title || "Content Creation",
      subtitle: categories[1]?.subtitle || "Save 85% production time",
      icon: RiVideoLine,
      gradient: "from-purple-500 to-blue-600",
      cases: (categories[1]?.cases || []).map((item, index) => ({
        icon: [RiVideoLine, RiMicLine, RiSearchEyeLine][index] || RiVideoLine,
        title: item.title,
        description: item.description
      }))
    },
    {
      title: categories[2]?.title || "Business Use",
      subtitle: categories[2]?.subtitle || "Trusted by 500+ enterprises",
      icon: RiBuildingLine,
      gradient: "from-green-500 to-teal-600",
      cases: (categories[2]?.cases || []).map((item, index) => ({
        icon: [RiZoomInLine, RiChatQuoteLine, RiFileTextLine][index] || RiZoomInLine,
        title: item.title,
        description: item.description
      }))
    },
    {
      title: categories[3]?.title || "Research",
      subtitle: categories[3]?.subtitle || "Improve 60% research efficiency",
      icon: RiSearchEyeLine,
      gradient: "from-indigo-500 to-purple-600",
      cases: (categories[3]?.cases || []).map((item, index) => ({
        icon: [RiChatQuoteLine, RiTeamLine, RiGlobalLine][index] || RiChatQuoteLine,
        title: item.title,
        description: item.description
      }))
    }
  ];

  return (
    <section className="design-section">
      <div className="container mx-auto px-4 max-w-7xl">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="text-center mb-16"
        >
          <motion.div
            variants={categoryVariants}
            className="mb-6"
          >
            <div className="design-icon pulse mx-auto mb-6">
              <RiVideoLine />
            </div>
            <h2 className="design-heading-1 mb-6">
              {t('title')}
            </h2>
            <p className="design-description" dangerouslySetInnerHTML={{ __html: t('description') }} />
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-full text-purple-300 text-sm font-medium">
              {t('processing_notice')}
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={containerVariants}
          className="design-grid design-grid-2 gap-8"
        >
          {useCaseCategories.map((category, categoryIndex) => (
            <motion.div
              key={categoryIndex}
              variants={categoryVariants}
              className="design-card interactive group"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${category.gradient} flex items-center justify-center text-white text-2xl shadow-lg`}>
                  <category.icon />
                </div>
                <div>
                  <h3 className="design-heading-3 mb-1">{category.title}</h3>
                  <p className="text-gray-400 text-sm font-medium">{category.subtitle}</p>
                </div>
              </div>

              <div className="space-y-4">
                {category.cases.map((useCase, caseIndex) => (
                  <motion.div
                    key={caseIndex}
                    variants={caseVariants}
                    className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 group/item cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500/20 to-blue-500/20 flex items-center justify-center text-purple-300 text-lg flex-shrink-0 group-hover/item:scale-110 transition-transform duration-300">
                      <useCase.icon />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="design-heading-5 text-white mb-1 group-hover/item:text-purple-300 transition-colors">
                        {useCase.title}
                      </h4>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        {useCase.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
