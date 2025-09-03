"use client";

import { motion } from "framer-motion";
import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default function Stats({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section bg-gradient-to-b from-gray-900/50 to-purple-900/20">
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
        
        <div className="design-grid design-grid-4 gap-6">
          {section.items?.map((item: any, i: number) => {
            const colorMap: { [key: string]: string } = {
              blue: "text-blue-400 border-blue-400/30 bg-blue-400/10",
              green: "text-green-400 border-green-400/30 bg-green-400/10", 
              emerald: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
              purple: "text-purple-400 border-purple-400/30 bg-purple-400/10",
              red: "text-red-400 border-red-400/30 bg-red-400/10",
              violet: "text-violet-400 border-violet-400/30 bg-violet-400/10",
              indigo: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
              pink: "text-pink-400 border-pink-400/30 bg-pink-400/10"
            };
            
            const cardColor = colorMap[item.color] || colorMap.purple;
            
            return (
              <motion.div
                key={i}
                className={`relative p-6 rounded-xl border backdrop-blur-sm hover:backdrop-blur-md transition-all duration-300 ${cardColor}`}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  delay: i * 0.1, 
                  duration: 0.6,
                  type: "spring",
                  stiffness: 120
                }}
                viewport={{ once: true }}
                whileHover={{ 
                  scale: 1.02,
                  y: -4,
                  transition: { duration: 0.2 }
                }}
              >
                {/* Dashboard-style indicator */}
                <motion.div 
                  className="absolute top-4 right-4 w-2 h-2 bg-green-400 rounded-full"
                  animate={{ 
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{ 
                    duration: 2 + (i * 0.3),
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
                
                <div className="relative z-10">
                  {/* Icon */}
                  <motion.div 
                    className="mb-4 flex items-center justify-between"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: i * 0.1 + 0.2, 
                      duration: 0.5
                    }}
                    viewport={{ once: true }}
                  >
                    <Icon name={item.icon || "RiBarChartLine"} className="w-8 h-8" />
                    <span className="text-xs font-mono opacity-60">#{i + 1}</span>
                  </motion.div>

                  {/* Data Value */}
                  <motion.div 
                    className="mb-3"
                    initial={{ scale: 0.5, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    transition={{ 
                      delay: i * 0.1 + 0.3, 
                      duration: 0.6,
                      type: "spring",
                      stiffness: 150
                    }}
                    viewport={{ once: true }}
                  >
                    <div className="text-3xl font-bold mb-1">
                      {item.title || item.label}
                    </div>
                    <div className="text-sm opacity-80">
                      {item.description}
                    </div>
                  </motion.div>
                  
                  {/* Trend indicator */}
                  <motion.div 
                    className="flex items-center gap-2 text-xs font-semibold opacity-60"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 0.6, y: 0 }}
                    transition={{ delay: i * 0.1 + 0.5, duration: 0.5 }}
                    viewport={{ once: true }}
                  >
                    <motion.span 
                      className="inline-block"
                      animate={{ 
                        rotate: [0, 5, -5, 0],
                      }}
                      transition={{ 
                        duration: 3 + (i * 0.5),
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      📊
                    </motion.span>
                    {item.trend}
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
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
