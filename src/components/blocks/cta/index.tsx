"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Icon from "@/components/icon";
import Link from "next/link";
import { Section as SectionType } from "@/types/blocks/section";
import { RiRocketLine, RiTimeLine } from "react-icons/ri";

export default function CTA({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <motion.div 
          className="design-card text-center py-16 bg-gradient-to-b from-gray-900/50 to-gray-800/30 border-gray-700/30"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <div className="mx-auto max-w-4xl">
            {/* Enhanced visual hierarchy */}
            <motion.div
              className="mb-6"
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              viewport={{ once: true }}
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white text-4xl mx-auto shadow-2xl">
                <RiRocketLine className="w-10 h-10" />
              </div>
            </motion.div>

            <motion.h2 
              className="design-heading-1 mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              viewport={{ once: true }}
            >
              {section.title}
            </motion.h2>
            
            <motion.div 
              className="design-description mb-10"
              dangerouslySetInnerHTML={{ __html: section.description || "" }}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              viewport={{ once: true }}
            />

            {section.buttons && (
              <motion.div 
                className="flex flex-col justify-center gap-4 sm:flex-row mb-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                viewport={{ once: true }}
              >
                {section.buttons.map((item, idx) => {
                  const isPrimary = item.variant === "default" || !item.variant;
                  return (
                    <motion.div
                      key={idx}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Link
                        href={item.url || ""}
                        target={item.target}
                        className={isPrimary ? "inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 border-2 border-blue-500/30" : "design-btn-secondary"}
                      >
                        {/* Temporarily disable dynamic icons */}
                        {item.title}
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Urgency indicator */}
            <motion.div 
              className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-lg p-4 border border-blue-400/30"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              viewport={{ once: true }}
            >
              <p className="text-blue-300 font-semibold flex items-center justify-center gap-2">
                <RiTimeLine className="w-5 h-5" />
                ⚡ Start saving time today - No setup required
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
