"use client";

import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useTranslations } from 'next-intl';
import { 
  RiCalculatorLine,
  RiTimeLine,
  RiMoneyDollarCircleLine,
  RiSpeedUpLine,
  RiLineChartLine,
  RiArrowRightLine,
  RiCheckLine
} from "react-icons/ri";

interface Section {
  name: string;
  disabled: boolean;
}

interface ROICalculatorProps {
  section: Section;
}

interface CalculationResult {
  monthlyHours: number;
  traditionalCost: number;
  traditionalTime: number;
  traditionalDays: number;
  ourCost: number;
  ourTime: number;
  monthlySavings: number;
  yearlySavings: number;
  timeSaved: number;
  roi: number;
}

export default function ROICalculator({ section }: ROICalculatorProps) {
  const t = useTranslations('roi_calculator');
  const [monthlyHours, setMonthlyHours] = useState(10);

  // 计算逻辑
  const calculation = useMemo((): CalculationResult => {
    // 传统方式成本
    const hourlyRate = 60; // 人工转写每小时60元
    const selfWorkHours = monthlyHours * 5; // 自己整理需要5倍时间
    const traditionalCost = monthlyHours * hourlyRate; // 雇人转写成本
    const traditionalTime = selfWorkHours; // 自己整理需要的时间
    const traditionalDays = Math.ceil(traditionalTime / 8); // 按每天8小时工作计算

    // 我们的成本
    const pricePerHour = 2.9; // 每小时2.9元
    const ourCost = monthlyHours * pricePerHour;
    const ourTime = monthlyHours * 0.05; // 只需要5%的时间来检查和编辑

    // 节省计算
    const monthlySavings = traditionalCost - ourCost;
    const yearlySavings = monthlySavings * 12;
    const timeSaved = traditionalTime - ourTime;
    const roi = Math.round((monthlySavings / ourCost) * 100);

    return {
      monthlyHours,
      traditionalCost,
      traditionalTime,
      traditionalDays,
      ourCost,
      ourTime,
      monthlySavings,
      yearlySavings,
      timeSaved,
      roi
    };
  }, [monthlyHours]);

  if (section?.disabled) return null;

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
            <RiCalculatorLine />
          </div>
          <h2 className="design-heading-1 mb-6">
            {t('title')}
          </h2>
          <p className="design-description" dangerouslySetInnerHTML={{ __html: t('description') }} />
        </motion.div>

        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="design-card mb-8"
          >
            <div className="text-center mb-8">
              <h3 className="design-heading-3 mb-4">{t('yourNeeds')}</h3>
              <div className="max-w-md mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-gray-300">{t('monthlyHours')}</span>
                  <span className="design-heading-4 text-purple-300">{monthlyHours} {t('hours')}</span>
                </div>
                
                {/* 自定义滑块 */}
                <div className="relative">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={monthlyHours}
                    onChange={(e) => setMonthlyHours(Number(e.target.value))}
                    className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #8b5cf6 0%, #a855f7 ${(monthlyHours / 100) * 100}%, #374151 ${(monthlyHours / 100) * 100}%, #374151 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>1{t('hours')}</span>
                    <span>25{t('hours')}</span>
                    <span>50{t('hours')}</span>
                    <span>75{t('hours')}</span>
                    <span>100{t('hours')}+</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* 传统方式 */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="design-card"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-red-500 to-orange-600 flex items-center justify-center text-white text-3xl mx-auto mb-4">
                  <RiTimeLine />
                </div>
                <h3 className="design-heading-3 text-red-300">{t('traditionalWay')}</h3>
              </div>

              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiMoneyDollarCircleLine className="text-red-400" />
                    <span className="text-sm text-gray-300">{t('hiringCost')}</span>
                  </div>
                  <p className="text-2xl font-bold text-red-300">
                    ¥{calculation.traditionalCost.toLocaleString()}/月
                  </p>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiTimeLine className="text-orange-400" />
                    <span className="text-sm text-gray-300">{t('selfOrganizeTime')}</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-300">
                    {calculation.traditionalTime}{t('hours')}/月
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('aboutDays', { days: calculation.traditionalDays })}
                  </p>
                </div>

                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiSpeedUpLine className="text-purple-400" />
                    <span className="text-sm text-gray-300">{t('waitingTime')}</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-300">3-5天</p>
                </div>
              </div>
            </motion.div>

            {/* 我们的方式 */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="design-card relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5"></div>
              <div className="relative text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center text-white text-3xl mx-auto mb-4">
                  <RiCheckLine />
                </div>
                <h3 className="design-heading-3 text-green-300">{t('usingUs')}</h3>
              </div>

              <div className="relative space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiMoneyDollarCircleLine className="text-green-400" />
                    <span className="text-sm text-gray-300">{t('serviceCost')}</span>
                  </div>
                  <p className="text-2xl font-bold text-green-300">
                    ¥{calculation.ourCost.toFixed(0)}/月
                  </p>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiTimeLine className="text-emerald-400" />
                    <span className="text-sm text-gray-300">{t('processingTime')}</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-300">
                    {calculation.ourTime.toFixed(1)}{t('hours')}/月
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('onlyNeedCheck')}
                  </p>
                </div>

                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <RiSpeedUpLine className="text-cyan-400" />
                    <span className="text-sm text-gray-300">{t('getResult')}</span>
                  </div>
                  <p className="text-2xl font-bold text-cyan-300">{t('immediately')}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 节省结果 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="design-card featured text-center"
          >
            <div className="mb-8">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-white text-4xl mx-auto mb-6 shadow-2xl">
                <RiLineChartLine />
              </div>
              <h3 className="design-heading-2 mb-4">{t('youWillSave')}</h3>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-2xl p-6 border border-purple-500/30">
                <div className="text-4xl font-black mb-2 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  ¥{calculation.monthlySavings.toLocaleString()}
                </div>
                <div className="text-purple-300 font-semibold">{t('monthlySavings')}</div>
              </div>

              <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl p-6 border border-green-500/30">
                <div className="text-4xl font-black mb-2 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                  ¥{calculation.yearlySavings.toLocaleString()}
                </div>
                <div className="text-green-300 font-semibold">{t('yearlySavings')}</div>
              </div>

              <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-2xl p-6 border border-orange-500/30">
                <div className="text-4xl font-black mb-2 bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                  {calculation.roi.toLocaleString()}%
                </div>
                <div className="text-orange-300 font-semibold">{t('roi')}</div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl p-6 border border-blue-500/20 mb-6">
              <div className="flex items-center justify-center gap-4 text-lg">
                <span className="text-gray-300">{t('timeSaved')}:</span>
                <span className="font-bold text-blue-300">
                  {calculation.timeSaved.toFixed(1)}{t('hours')}/月
                </span>
                <RiArrowRightLine className="text-purple-400" />
                <span className="text-purple-300 font-semibold">
                  {t('equivalentTo')}{(calculation.timeSaved / 8).toFixed(1)}{t('workDays')}
                </span>
              </div>
            </div>

            <div className="text-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="design-btn-primary enhanced"
              >
                {t('startSavingCosts')}
                <RiArrowRightLine />
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* 自定义滑块样式 */}
        <style jsx>{`
          .slider::-webkit-slider-thumb {
            appearance: none;
            height: 24px;
            width: 24px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
          }
          
          .slider::-moz-range-thumb {
            height: 24px;
            width: 24px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6, #a855f7);
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
          }
        `}</style>
      </div>
    </section>
  );
}