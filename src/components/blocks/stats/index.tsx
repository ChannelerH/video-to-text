"use client";

import { motion } from "framer-motion";
import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default function Stats({ section }: { section: SectionType }) {
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
              <h2 className="design-heading-2">
                {section.title}
              </h2>
            )}
            {section.description && (
              <p className="design-description">
                {section.description}
              </p>
            )}
          </div>
        )}
        
        <div className="design-grid design-grid-8">
          {section.items?.map((item, i) => (
            <motion.div
              key={i}
              className="design-stat relative"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ 
                delay: i * 0.15, 
                duration: 0.7,
                type: "spring",
                stiffness: 100
              }}
              viewport={{ once: true }}
              whileHover={{ 
                scale: 1.05,
                transition: { duration: 0.2 }
              }}
            >
              {/* Background glow effect */}
              <motion.div 
                className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg opacity-0"
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              
              <div className="relative z-10">
                {/* Animated counter */}
                <motion.div 
                  className="design-stat-number"
                  initial={{ scale: 0.5, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  transition={{ 
                    delay: i * 0.15 + 0.3, 
                    duration: 0.8,
                    type: "spring",
                    stiffness: 120
                  }}
                  viewport={{ once: true }}
                >
                  {item.title || item.label}
                </motion.div>
                
                {/* Description */}
                <motion.div 
                  className="design-stat-label"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ delay: i * 0.15 + 0.5, duration: 0.6 }}
                  viewport={{ once: true }}
                >
                  {item.description}
                </motion.div>
                
                {/* Animated progress indicator */}
                <motion.div 
                  className="mt-6 h-1 bg-gray-700 rounded-full overflow-hidden"
                  initial={{ width: "0%" }}
                  whileInView={{ width: "100%" }}
                  transition={{ delay: i * 0.15 + 0.7, duration: 1 }}
                  viewport={{ once: true }}
                >
                  <motion.div 
                    className="h-full bg-gradient-to-r from-blue-400 to-purple-500 rounded-full"
                    initial={{ width: "0%" }}
                    whileInView={{ width: "100%" }}
                    transition={{ 
                      delay: i * 0.15 + 0.9, 
                      duration: 1.5,
                      ease: "easeOut" 
                    }}
                    viewport={{ once: true }}
                  />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
        
        {/* Professional social proof */}
        <motion.div 
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          viewport={{ once: true }}
        >
          <div className="design-card inline-block px-8 py-4 bg-gradient-to-r from-yellow-500/10 to-yellow-400/10 border-yellow-400/20">
            <motion.p 
              className="text-yellow-400 font-semibold text-lg"
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
