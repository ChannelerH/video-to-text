"use client";

import { motion } from "framer-motion";
import { Section as SectionType } from "@/types/blocks/section";
import { Shield, Zap, Globe, Code, Database, Clock } from "lucide-react";

export default function TechSpecs({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  const techSpecs = [
    {
      category: "AI Model",
      icon: <Zap className="w-6 h-6" />,
      items: [
        { label: "Model", value: "OpenAI Whisper Large-v3" },
        { label: "Accuracy (WER)", value: "< 5% (English), < 8% (Chinese)" },
        { label: "Processing", value: "GPU-accelerated inference" },
        { label: "Languages", value: "104 languages supported" }
      ]
    },
    {
      category: "Performance",
      icon: <Clock className="w-6 h-6" />,
      items: [
        { label: "Latency P50", value: "< 2 minutes" },
        { label: "Latency P99", value: "< 5 minutes" },
        { label: "Throughput", value: "100+ concurrent jobs" },
        { label: "Queue time", value: "< 30 seconds (standard)" }
      ]
    },
    {
      category: "Security",
      icon: <Shield className="w-6 h-6" />,
      items: [
        { label: "Encryption", value: "TLS 1.3, AES-256" },
        { label: "Compliance", value: "GDPR, CCPA, SOC 2 Type II" },
        { label: "Data retention", value: "30 days (configurable)" },
        { label: "Privacy", value: "Zero-logging policy" }
      ]
    },
    {
      category: "API & Integration",
      icon: <Code className="w-6 h-6" />,
      items: [
        { label: "REST API", value: "v2.0 with webhooks" },
        { label: "GraphQL", value: "Coming soon" },
        { label: "SDKs", value: "Python, Node.js, Go, Java" },
        { label: "Rate limits", value: "1000 req/hour (Pro)" }
      ]
    },
    {
      category: "Reliability",
      icon: <Database className="w-6 h-6" />,
      items: [
        { label: "Uptime SLA", value: "99.9% (Pro), 99.5% (Free)" },
        { label: "Monitoring", value: "24/7 system monitoring" },
        { label: "Failover", value: "Multi-region redundancy" },
        { label: "Backup", value: "Real-time data replication" }
      ]
    },
    {
      category: "Global Scale",
      icon: <Globe className="w-6 h-6" />,
      items: [
        { label: "CDN", value: "Global edge locations" },
        { label: "Regions", value: "US, EU, APAC availability" },
        { label: "Users", value: "10,000+ active monthly" },
        { label: "Processing", value: "1M+ hours transcribed" }
      ]
    }
  ];

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-2">Technical Specifications</h2>
          <p className="design-description">
            Built on enterprise-grade infrastructure with professional reliability
          </p>
        </div>

        <div className="design-grid design-grid-3">
          {techSpecs.map((spec, index) => (
            <motion.div
              key={index}
              className="design-card hover:border-purple-500/30"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                  {spec.icon}
                </div>
                <h3 className="design-heading-4">{spec.category}</h3>
              </div>
              
              <div className="space-y-4">
                {spec.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex justify-between items-center py-2 border-b border-gray-700/50">
                    <span className="text-gray-300 text-sm">{item.label}</span>
                    <span className="text-white font-semibold text-sm">{item.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Professional certifications */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="design-card bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-400/20">
            <h4 className="design-heading-5 mb-6 text-purple-300">Certifications & Compliance</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                "SOC 2 Type II",
                "GDPR Compliant",
                "ISO 27001",
                "CCPA Ready"
              ].map((cert, index) => (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Shield className="w-6 h-6 text-purple-400" />
                  </div>
                  <span className="text-xs text-gray-400">{cert}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}