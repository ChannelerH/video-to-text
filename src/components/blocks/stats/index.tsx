"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default function Stats({ section }: { section: SectionType }) {
  const t = useTranslations('stats');
  
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        {(section.title || section.description || section.label) && (
          <div className="text-center mb-16">
            {section.label && (
              <motion.div 
                className="design-badge inline-block mb-4"
                initial={{ opacity: 0, y: -20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                {section.icon && (
                  <Icon name={section.icon} className="w-5 h-5 mr-2" />
                )}
                {section.label}
              </motion.div>
            )}
            {section.title && (
              <motion.h2 
                className="design-heading-1 mb-6 bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
                dangerouslySetInnerHTML={{ __html: section.title }}
              />
            )}
            {section.description && (
              <motion.div
                className="design-description max-w-4xl mx-auto"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
                dangerouslySetInnerHTML={{ __html: section.description }}
              />
            )}
            
            {/* Live indicator */}
            <motion.div 
              className="flex items-center justify-center gap-2 mt-6"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <motion.div 
                className="w-3 h-3 bg-green-400 rounded-full"
                animate={{ 
                  opacity: [0.4, 1, 0.4],
                  scale: [0.8, 1.1, 0.8]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              <span className="text-green-400 text-sm font-semibold">LIVE</span>
            </motion.div>
          </div>
        )}
        
        {/* 4个核心指标 - 简洁布局 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            className="design-card text-center p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl font-bold mb-1 text-white">
              2,567 <motion.span 
                className="text-lg text-green-400 font-black" 
                animate={{ 
                  y: [-2, 2, -2],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
              >↗ +12%</motion.span>
            </div>
            <div className="text-gray-400 text-sm mb-1">{t('daily_processed')}</div>
            <div className="text-xs text-gray-500">{t('industry_average', { value: '800' })}</div>
          </motion.div>

          <motion.div
            className="design-card text-center p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl font-bold mb-1 text-white">
              95.5% <motion.span 
                className="text-lg text-green-400 font-black" 
                animate={{ 
                  rotate: [0, 10, 0],
                  scale: [1, 1.15, 1]
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 0.5 
                }}
              >🎯</motion.span>
            </div>
            <div className="text-gray-400 text-sm mb-1">{t('accuracy_rate')}</div>
            <div className="text-xs text-gray-500">{t('industry_leading')}</div>
          </motion.div>

          <motion.div
            className="design-card text-center p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl font-bold mb-1 text-white">
              1.9min <motion.span 
                className="text-lg text-blue-400 font-black" 
                animate={{ 
                  x: [-3, 3, -3],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{ 
                  duration: 1.8, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 1 
                }}
              >⚡ {t('times_faster', { times: 3 })}</motion.span>
            </div>
            <div className="text-gray-400 text-sm mb-1">{t('average_speed')}</div>
            <div className="text-xs text-gray-500">{t('competitor_average', { value: '6min' })}</div>
          </motion.div>

          <motion.div
            className="design-card text-center p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            viewport={{ once: true }}
          >
            <div className="text-3xl font-bold mb-1 text-white">
              234 <motion.span 
                className="text-lg text-purple-400 font-black" 
                animate={{ 
                  scale: [1, 1.2, 1],
                  y: [-1, 1, -1]
                }}
                transition={{ 
                  duration: 2.2, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 1.5 
                }}
              >📈 +15</motion.span>
            </div>
            <div className="text-gray-400 text-sm mb-1">{t('online_users')}</div>
            <div className="flex items-center justify-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 text-xs">{t('live')}</span>
            </div>
          </motion.div>
        </div>
        
        {/* Professional social proof */}
        <motion.div 
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          viewport={{ once: true }}
        >
          <div className="design-card inline-block px-8 py-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-400/20">
            <motion.p 
              className="text-purple-400 font-semibold text-lg"
              initial={{ scale: 0.9 }}
              whileInView={{ scale: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
              viewport={{ once: true }}
            >
              ★★★★★ 4.8/5 | 10,000+ satisfied customers | 50+ countries
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
