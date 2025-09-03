"use client";

import { motion } from "framer-motion";
import { Check, X, Crown, TrendingDown, Calculator } from "lucide-react";
import { Section as SectionType } from "@/types/blocks/section";

interface ComparisonItem {
  title: string;
  description?: string;
  icon?: string;
  us?: string;
  competitor?: string;
  manual?: string;
  highlight?: boolean;
}

interface SavingsData {
  title: string;
  manual_cost: string;
  competitor_cost: string;
  our_cost: string;
  savings_percent: string;
  subtitle: string;
}

export default function ComparisonTable({ section }: { section: SectionType & { savings?: SavingsData } }) {
  if (section.disabled) {
    return null;
  }

  // Parse comparison data from section items
  const comparisonData: ComparisonItem[] = section.items?.map(item => {
    const parts = item.description?.split(' / ') || [];
    return {
      title: item.title || '',
      icon: item.icon || '',
      us: parts[0] || '',
      competitor: parts[1] || '',
      manual: parts[2] || '',
      highlight: item.title?.toLowerCase().includes('cost') || item.title?.toLowerCase().includes('speed')
    };
  }) || [];

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-2">
            {section.title}
          </h2>
          <p className="design-description">
            {section.description}
          </p>
        </div>

        {/* Cost Savings Visualization */}
        {section.savings && (
          <motion.div 
            className="mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="design-card bg-gradient-to-r from-green-900/20 to-blue-900/20 border-green-400/20">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Calculator className="w-8 h-8 text-green-400" />
                  <h3 className="design-heading-3 text-green-400">{section.savings.title}</h3>
                </div>
                <p className="text-gray-300">{section.savings.subtitle}</p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-8 mb-8">
                {/* Manual Cost */}
                <motion.div 
                  className="text-center"
                  initial={{ scale: 0.9 }}
                  whileInView={{ scale: 1 }}
                  transition={{ delay: 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="text-red-400 text-2xl font-bold mb-2">Manual Service</div>
                  <div className="text-4xl font-bold text-red-400 mb-2">{section.savings.manual_cost}</div>
                  <div className="flex justify-center gap-1">
                    {Array.from({length: 20}).map((_, i) => (
                      <span key={i} className="text-red-400">💰</span>
                    ))}
                  </div>
                </motion.div>

                {/* Competitor Cost */}
                <motion.div 
                  className="text-center"
                  initial={{ scale: 0.9 }}
                  whileInView={{ scale: 1 }}
                  transition={{ delay: 0.2 }}
                  viewport={{ once: true }}
                >
                  <div className="text-orange-400 text-2xl font-bold mb-2">Competitors</div>
                  <div className="text-4xl font-bold text-orange-400 mb-2">{section.savings.competitor_cost}</div>
                  <div className="flex justify-center gap-1">
                    {Array.from({length: 5}).map((_, i) => (
                      <span key={i} className="text-orange-400">💰</span>
                    ))}
                  </div>
                </motion.div>

                {/* Our Cost */}
                <motion.div 
                  className="text-center"
                  initial={{ scale: 0.9 }}
                  whileInView={{ scale: 1 }}
                  transition={{ delay: 0.3 }}
                  viewport={{ once: true }}
                >
                  <div className="text-green-400 text-2xl font-bold mb-2">Our Service</div>
                  <div className="text-4xl font-bold text-green-400 mb-2">{section.savings.our_cost}</div>
                  <div className="flex justify-center gap-1">
                    <span className="text-green-400">💰</span>
                  </div>
                </motion.div>
              </div>

              <motion.div 
                className="text-center bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-lg p-6"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                viewport={{ once: true }}
              >
                <div className="flex items-center justify-center gap-3 mb-2">
                  <TrendingDown className="w-8 h-8 text-green-400" />
                  <span className="text-5xl font-bold text-green-400">{section.savings.savings_percent}</span>
                  <span className="text-2xl text-green-400 font-semibold">SAVINGS</span>
                </div>
                <p className="text-green-300">You save over ¥{section.savings.manual_cost} annually!</p>
              </motion.div>
            </div>
          </motion.div>
        )}

        <div className="design-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              {/* Header */}
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-6 px-6 font-semibold text-lg text-gray-300">Feature</th>
                  <th className="text-center py-6 px-6 relative">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      whileInView={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      viewport={{ once: true }}
                    >
                      <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-4 relative">
                        <Crown className="w-6 h-6 text-yellow-400 absolute -top-3 left-1/2 transform -translate-x-1/2" />
                        <div className="text-white font-bold text-lg">Our Service</div>
                        <div className="text-blue-100 text-sm">AI-Powered</div>
                      </div>
                    </motion.div>
                  </th>
                  <th className="text-center py-6 px-6">
                    <div className="text-gray-400 font-semibold text-lg">Competitors</div>
                    <div className="text-gray-500 text-sm">Average</div>
                  </th>
                  <th className="text-center py-6 px-6">
                    <div className="text-gray-400 font-semibold text-lg">Manual Service</div>
                    <div className="text-gray-500 text-sm">Traditional</div>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {comparisonData.map((item, index) => (
                  <motion.tr
                    key={index}
                    className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${
                      item.highlight ? 'bg-gradient-to-r from-blue-500/5 to-purple-500/5' : ''
                    }`}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <td className="py-6 px-6">
                      <div className="flex items-center gap-3">
                        {item.icon && <span className="text-2xl">{item.icon}</span>}
                        <div className="font-semibold text-white">{item.title}</div>
                      </div>
                    </td>
                    
                    {/* Our Service Column */}
                    <td className="py-6 px-6 text-center">
                      <motion.div
                        className="inline-block px-4 py-2 bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-400/30 rounded-lg"
                        whileHover={{ scale: 1.05 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="text-green-400 font-bold text-lg">{item.us}</div>
                        <Check className="w-5 h-5 text-green-400 mx-auto mt-1" />
                      </motion.div>
                    </td>
                    
                    {/* Competitor Column */}
                    <td className="py-6 px-6 text-center">
                      <div className="text-orange-400 font-semibold">{item.competitor}</div>
                    </td>
                    
                    {/* Manual Column */}
                    <td className="py-6 px-6 text-center">
                      <div className="text-red-400 font-semibold">{item.manual}</div>
                      <X className="w-5 h-5 text-red-400 mx-auto mt-1" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA at bottom */}
          <motion.div
            className="p-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-t border-gray-700"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            viewport={{ once: true }}
          >
            <div className="text-center">
              <p className="text-gray-300 mb-4">Ready to experience the difference?</p>
              <motion.button
                className="design-btn-primary"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Free Trial
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}