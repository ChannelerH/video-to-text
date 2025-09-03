"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Section as SectionType } from "@/types/blocks/section";
import { RiAddLine, RiSubtractLine, RiQuestionLine } from "react-icons/ri";

export default function FAQ({ section }: { section: SectionType }) {
  const t = useTranslations('faq');
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  if (section.disabled) {
    return null;
  }

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenItems(newOpenItems);
  };

  return (
    <section id={section.name} className="design-section">
      <div className="container max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="design-icon pulse mx-auto mb-6">
            <RiQuestionLine />
          </div>
          {section.label && (
            <div className="design-badge premium mb-4">
              {section.label}
            </div>
          )}
          <h2 className="design-heading-2">{section.title}</h2>
          <p className="design-description">
            {section.description}
          </p>
        </div>
        
        <div className="space-y-4">
          {section.items?.map((item, index) => (
            <motion.div
              key={index}
              className="design-card interactive border-l-4 border-l-purple-500/30"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <button
                className="w-full flex items-center justify-between p-6 text-left"
                onClick={() => toggleItem(index)}
              >
                <div className="flex items-center gap-4">
                  <div className="design-badge text-xs font-mono">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h3 className="design-heading-4 text-left">
                    {item.title}
                  </h3>
                </div>
                
                <motion.div
                  animate={{ rotate: openItems.has(index) ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0 ml-4"
                >
                  {openItems.has(index) ? (
                    <RiSubtractLine className="w-6 h-6 text-purple-400" />
                  ) : (
                    <RiAddLine className="w-6 h-6 text-purple-400" />
                  )}
                </motion.div>
              </button>
              
              <AnimatePresence>
                {openItems.has(index) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6">
                      <div className="h-px bg-gradient-to-r from-purple-500/20 to-transparent mb-4" />
                      <motion.p 
                        className="text-muted-foreground leading-relaxed"
                        initial={{ y: -10 }}
                        animate={{ y: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        {item.description}
                      </motion.p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
        
        {/* 底部CTA */}
        <motion.div 
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          viewport={{ once: true }}
        >
          <p className="text-muted-foreground mb-4">
            {t('more_questions')}
          </p>
          <button className="design-btn-secondary">
            {t('contact_support')}
          </button>
        </motion.div>
      </div>
    </section>
  );
}
