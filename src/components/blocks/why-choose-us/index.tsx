"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Section as SectionType } from "@/types/blocks/section";

interface Feature {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
}

interface StatItem {
  number: string;
  label: string;
  sublabel: string;
}

export default function WhyChooseUs({ section }: { section: SectionType }) {
  const t = useTranslations("why_choose_us");

  if (section.disabled) {
    return null;
  }

  const features = t.raw('features') as Feature[];
  const stats = t.raw('stats') as { title: string; items: StatItem[] };

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
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut"
      }
    }
  };

  const statVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: "easeOut"
      }
    }
  };

  return (
    <section id={section.name} className="design-section">
      <div className="container max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="design-heading-1 mb-4">
            {section.title || t('title')}
          </h2>
          <p 
            className="design-description max-w-3xl mx-auto"
            dangerouslySetInnerHTML={{ __html: section.description || t('description') }}
          />
        </motion.div>

        {/* Features Grid */}
        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="design-card group hover:border-purple-500/40 transition-all duration-300"
            >
              {/* Icon & Title */}
              <div className="mb-6">
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="design-heading-3 mb-2 group-hover:text-purple-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-purple-400 text-sm font-semibold uppercase tracking-wider">
                  {feature.subtitle}
                </p>
              </div>

              {/* Description */}
              <p className="text-gray-300 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats Section */}
        <motion.div
          className="design-card bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/30"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-center mb-12">
            <h3 className="design-heading-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-4">
              {stats.title}
            </h3>
          </div>

          <motion.div
            className="grid grid-cols-2 lg:grid-cols-4 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {stats.items.map((stat, index) => (
              <motion.div
                key={index}
                variants={statVariants}
                className="text-center group"
              >
                <div className="relative">
                  {/* Number */}
                  <motion.div 
                    className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-400 mb-2"
                    whileHover={{ 
                      scale: 1.1,
                      textShadow: "0 0 20px rgba(59, 130, 246, 0.5)"
                    }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    {stat.number}
                  </motion.div>
                  
                  {/* Label */}
                  <div className="text-white font-semibold text-lg mb-1 group-hover:text-purple-300 transition-colors">
                    {stat.label}
                  </div>
                  
                  {/* Sublabel */}
                  <div className="text-gray-400 text-sm">
                    {stat.sublabel}
                  </div>

                  {/* Hover glow effect */}
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}