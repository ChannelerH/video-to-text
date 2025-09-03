"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Section as SectionType } from "@/types/blocks/section";

export default function ROICalculator({ section }: { section: SectionType }) {
  const t = useTranslations("roi_calculator");
  const [videoHours, setVideoHours] = useState(100);

  if (section.disabled) {
    return null;
  }

  // 详细成本计算
  const humanCost = videoHours * 200; // ¥200/小时人工成本
  const otherToolsCost = videoHours * 10; // ¥10/小时其他工具
  const ourCost = videoHours * 0.29; // ¥0.29/小时AI成本
  const monthlySavings = humanCost - ourCost;
  const yearlySavings = monthlySavings * 12;
  const roi = ((monthlySavings / ourCost) * 100).toFixed(0);
  const savingsPercent = ((monthlySavings / humanCost) * 100).toFixed(1);

  return (
    <section id={section.name} className="design-section">
      <div className="container max-w-4xl mx-auto">
        {/* 标题区 */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="design-heading-1 mb-4">
            {section.title || "成本对比"}
          </h2>
          <p className="design-description">
            {section.description || "看看您能节省多少成本"}
          </p>
        </motion.div>

        {/* 简单的滑块输入 */}
        <motion.div 
          className="mb-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-center mb-6">
            <label className="text-gray-400 text-sm">您的月需求</label>
            <div className="text-3xl font-bold text-white mt-2">
              {videoHours} 小时视频转写
            </div>
          </div>
          
          <input
            type="range"
            min="10"
            max="500"
            value={videoHours}
            onChange={(e) => setVideoHours(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb-purple"
          />
          
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>10小时</span>
            <span>500小时</span>
          </div>
        </motion.div>

        {/* 增强的成本对比 */}
        <motion.div 
          className="space-y-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          {/* 详细对比表 */}
          <div className="design-card p-8 bg-gray-900/30">
            <h3 className="text-lg font-semibold text-gray-300 mb-6">
              月度成本对比（{videoHours}小时）
            </h3>
            
            <div className="space-y-4">
              {/* 人工转写 */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-gray-400">人工转写</span>
                  <span className="text-xl font-bold text-gray-400">¥{humanCost.toLocaleString()}</span>
                </div>
                <div className="h-10 bg-gray-800 rounded-lg overflow-hidden">
                  <motion.div 
                    className="h-full bg-gray-600 rounded-lg flex items-center px-3"
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                  />
                </div>
              </div>

              {/* 其他工具 */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-gray-400">其他工具</span>
                  <span className="text-xl font-bold text-gray-400">¥{otherToolsCost.toLocaleString()}</span>
                </div>
                <div className="h-10 bg-gray-800 rounded-lg overflow-hidden">
                  <motion.div 
                    className="h-full bg-gray-500 rounded-lg"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(otherToolsCost / humanCost) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, duration: 1 }}
                  />
                </div>
              </div>

              {/* 我们的服务 */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-purple-400 font-semibold">我们服务</span>
                  <span className="text-xl font-bold text-purple-400">¥{ourCost.toFixed(0)}</span>
                </div>
                <div className="h-10 bg-gray-800 rounded-lg overflow-hidden">
                  <motion.div 
                    className="h-full bg-purple-500 rounded-lg"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.max((ourCost / humanCost) * 100, 1)}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6, duration: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 超大视觉冲击节省展示 */}
          <motion.div 
            className="design-card bg-gradient-to-br from-purple-500/15 to-purple-600/15 p-8 border-purple-500/40 relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9 }}
          >
            {/* 背景装饰 */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/5 rounded-full"></div>
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-600/5 rounded-full"></div>
            
            <div className="text-center relative z-10">
              <div className="text-sm text-gray-400 mb-4">每月只需一杯咖啡的价格</div>
              
              {/* 超大节省百分比 - 页面最醒目元素 */}
              <motion.div 
                className="text-9xl sm:text-[12rem] font-black bg-gradient-to-r from-green-300 via-emerald-400 to-green-300 bg-clip-text text-transparent mb-6 leading-none"
                style={{
                  filter: 'drop-shadow(0 0 40px rgba(34, 197, 94, 0.6)) drop-shadow(0 0 80px rgba(16, 185, 129, 0.4))',
                  textShadow: '0 0 100px rgba(34, 197, 94, 0.8)'
                }}
                initial={{ scale: 0.3, opacity: 0, rotateX: 90 }}
                whileInView={{ scale: 1, opacity: 1, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.1, duration: 1.2, type: "spring", bounce: 0.4 }}
                animate={{
                  textShadow: [
                    '0 0 100px rgba(34, 197, 94, 0.8)',
                    '0 0 120px rgba(16, 185, 129, 1)',
                    '0 0 100px rgba(34, 197, 94, 0.8)'
                  ]
                }}
                transition={{
                  textShadow: { duration: 2, repeat: Infinity, repeatType: 'reverse' }
                }}
              >
                节省{savingsPercent}%
              </motion.div>
              
              <div className="space-y-2 mb-6">
                <motion.div 
                  className="text-4xl font-bold text-white"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.5, duration: 0.6 }}
                >
                  节省 ¥{monthlySavings.toLocaleString()}<span className="text-lg text-gray-400">/月</span>
                </motion.div>
                <motion.div 
                  className="text-2xl text-emerald-300 font-semibold"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.8, duration: 0.6 }}
                >
                  = ¥{yearlySavings.toLocaleString()}/年
                </motion.div>
              </div>
              
              <div className="text-center p-4 bg-gray-800/30 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">相当于</div>
                <div className="text-lg font-semibold text-white">
                  一杯咖啡 vs 一个月工资
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}