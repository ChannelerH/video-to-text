import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import ToolInterface from "@/components/tool-interface";
import AudioUploadWidgetEnhanced from "@/components/landing/audio-upload-widget-enhanced";
import React from "react";

export const revalidate = 60;
export const dynamic = "force-dynamic";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://harku.io";
  let canonicalUrl = `${baseUrl}/audio-to-text`;

  if (locale !== "en") {
    canonicalUrl = `${baseUrl}/${locale}/audio-to-text`;
  }

  const title = "Audio to Text Converter - Free AI Transcription Online | Harku";
  const description = "Convert audio to text instantly with 99.2% accuracy. Free audio to text converter supporting MP3, WAV, M4A and 45+ formats. Transcribe audio to text in 80+ languages online.";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Harku",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      type: "website",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Harku - AI-Powered Audio to Text Converter",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-image.png`],
      creator: "@HarkuAI",
      site: "@HarkuAI",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

async function getAudioPage(locale: string) {
  try {
    if (locale === "zh-CN") {
      locale = "zh";
    }
    
    // 尝试加载特定语言的音频配置文件
    if (locale === "zh") {
      return await import(`@/i18n/pages/landing/audio-${locale}.json`).then(
        (module) => module.default
      );
    }
    
    // 默认加载英文配置
    return await import(`@/i18n/pages/landing/audio.json`).then(
      (module) => module.default
    );
  } catch (error) {
    console.warn(`Failed to load audio-${locale}.json, using default config`);
    return await import(`@/i18n/pages/landing/audio.json`).then(
      (module) => module.default
    );
  }
}

export default async function AudioToTextPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  // 尽量沿用已有多语言文案（如可用），但严格按新的 UI 结构渲染
  const page = await getAudioPage(locale).catch(() => undefined as any);

  const startHref = `/${locale}/dashboard/transcriptions`;

  return (
    <div className="relative">
      {/* Hero */}
      <section className="container py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left */}
          <div>
            <span className="inline-block text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 rounded-full text-sm mb-4">
              🎯 #1 Audio to Text Converter Online
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
              {page?.hero?.title || "Audio to Text — Convert audio to text & subtitles instantly"}
            </h1>
            <p className="text-slate-300 mb-8 text-base md:text-lg">
              {page?.hero?.description ||
                "Transform audio to text instantly with our advanced AI converter. Perfect for podcasts, meetings, interviews, and lectures. Start transcribing now."}
            </p>

            <div className="flex flex-col gap-3 mb-8">
              {[
                "99.2% transcription accuracy",
                "Support for 80+ languages",
                "Real-time processing",
              ].map((t) => (
                <div key={t} className="flex items-center gap-3 text-slate-300">
                  <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">✓</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Link
                href={startHref}
                className="btn-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold"
              >
                Start Free Trial
              </Link>
              <Link
                href="#demo"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold border border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
              >
                View Demo
              </Link>
            </div>
          </div>

          {/* Right - Enhanced Upload widget with progress and results */}
          <div>
            <AudioUploadWidgetEnhanced locale={locale} notice={t("notices.chinese_processing")} />
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="container grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
          {[
            { n: "99.2%", l: "Accuracy" },
            { n: "80+", l: "Languages" },
            { n: "10M+", l: "Conversions" },
            { n: "5min", l: "Processing Speed" },
            { n: "24/7", l: "Support" },
          ].map((s) => (
            <div key={s.l} className="relative">
              <div className="text-2xl font-bold text-cyan-400">{s.n}</div>
              <div className="text-slate-400 text-sm">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-16 md:py-24" id="how-it-works">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-semibold">How Audio to Text Works</h2>
          <p className="text-slate-400 mt-3">Simple 3-step process - convert your files in minutes</p>
        </div>
        <div className="relative max-w-3xl mx-auto pl-10">
          <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-cyan-400/80 to-transparent" />
          {[
            {
              t: "Upload Your Audio",
              d:
                "Upload any format - MP3, WAV, M4A, and more. Our system accepts files up to 5GB for batch processing.",
            },
            {
              t: "AI Processing",
              d:
                "Our advanced AI analyzes your files with speaker identification and automatic punctuation.",
            },
            {
              t: "Download Results",
              d:
                "Review your transcription, edit if needed, and export in multiple formats including TXT, SRT, DOCX, and more.",
            },
          ].map((x, i) => (
            <div key={x.t} className="relative mb-10">
              <div className="absolute -left-6 top-2 w-10 h-10 rounded-full bg-cyan-500 text-slate-900 font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-cyan-500/50 hover:translate-x-1 transition-transform">
                <h3 className="text-lg text-cyan-400 mb-2">{x.t}</h3>
                <p className="text-slate-300 leading-relaxed">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases (simple track) */}
      <section className="py-16 bg-slate-900/60">
        <div className="container text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-semibold">
            Transcription for Every Industry
          </h2>
          <p className="text-slate-400 mt-3">Professional solutions trusted by millions worldwide</p>
        </div>
        <div className="container overflow-hidden">
          <div className="flex gap-6 min-w-full will-change-transform animate-[marquee_22s_linear_infinite]">
            {[
              { icon: "🎙️", title: "Podcasts", desc: "Create searchable show notes and transcripts." },
              { icon: "💼", title: "Business Meetings", desc: "Generate accurate meeting minutes automatically." },
              { icon: "📰", title: "Interviews", desc: "Transcribe interviews for journalism and research." },
              { icon: "🎓", title: "Education", desc: "Convert lectures and academic content for students." },
              { icon: "⚖️", title: "Legal", desc: "Create timestamped depositions and court transcripts." },
              { icon: "🏥", title: "Healthcare", desc: "HIPAA-compliant medical transcription services." },
              // repeat a few for continuous track
              { icon: "🎙️", title: "Podcasts", desc: "Transform episodes into searchable content." },
              { icon: "💼", title: "Business", desc: "Professional meeting documentation." },
            ].map((c, idx) => (
              <div
                key={idx}
                className="min-w-[280px] md:min-w-[340px] rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-left hover:border-cyan-500/60 hover:-translate-y-1 transition"
              >
                <div className="text-4xl mb-3">{c.icon}</div>
                <div className="text-xl text-cyan-400 mb-2">{c.title}</div>
                <p className="text-slate-300">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento */}
      <section className="container py-16">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-semibold">
            Powerful Features
          </h2>
          <p className="text-slate-400 mt-3">Everything you need for professional transcription</p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-5 auto-rows-[200px]">
          {/* Large item */}
          <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">👥</div>
            <div className="text-cyan-400 font-semibold mb-1">Speaker Detection</div>
            <p className="text-slate-300 text-sm">
              Automatically identify and label different speakers.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">🔊</div>
            <div className="text-cyan-400 font-semibold mb-1">Noise Reduction</div>
            <p className="text-slate-300 text-sm">AI removes background noise for crystal-clear transcriptions.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">⏱️</div>
            <div className="text-cyan-400 font-semibold mb-1">Precise Timestamps</div>
            <p className="text-slate-300 text-sm">Navigate transcripts easily with accurate time markers.</p>
          </div>
          <div className="md:row-span-2 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">🌍</div>
            <div className="text-cyan-400 font-semibold mb-1">80+ Languages</div>
            <p className="text-slate-300 text-sm">Transcribe in multiple languages with accent recognition.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-cyan-400 font-semibold mb-1">Smart Formatting</div>
            <p className="text-slate-300 text-sm">Automatic punctuation and paragraph breaks for readable transcripts.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">🎧</div>
            <div className="text-cyan-400 font-semibold mb-1">Podcast Mode</div>
            <p className="text-slate-300 text-sm">Optimized for long-form audio content.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">📱</div>
            <div className="text-cyan-400 font-semibold mb-1">Mobile Ready</div>
            <p className="text-slate-300 text-sm">Works on all devices, anywhere.</p>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-16 bg-gradient-to-b from-black to-slate-900" id="demo">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-semibold">Audio to Text Results</h2>
          <p className="text-slate-400 mt-3">See how our audio to text converter transforms files instantly</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {/* Before */}
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
                <div className="flex items-center gap-2 text-lg">
                  <span>🎵</span>
                  <span>Original Audio</span>
                </div>
                <span className="px-2 py-1 rounded-md text-xs text-cyan-400 border border-cyan-500/40 bg-cyan-500/10">Before</span>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4 rounded-xl bg-slate-900/60 p-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">▶</div>
                  <div className="flex-1 h-10 flex items-end gap-1">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} className="w-1 bg-cyan-400/60 rounded-sm" style={{ height: `${15 + ((i * 7) % 35)}px` }} />
                    ))}
                  </div>
                </div>
                <div className="mt-4 text-left text-slate-400 text-sm">
                  <p>📁 interview_recording.mp3</p>
                  <p>⏱️ Duration: 5:32</p>
                  <p>📊 Size: 8.2 MB</p>
                </div>
              </div>
            </div>

            {/* After */}
            <div className="rounded-2xl border border-cyan-600/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
                <div className="flex items-center gap-2 text-lg">
                  <span>📝</span>
                  <span>Transcribed Text</span>
                </div>
                <span className="px-2 py-1 rounded-md text-xs text-cyan-400 border border-cyan-500/40 bg-cyan-500/10">After</span>
              </div>
              <div className="p-6">
                <div className="rounded-xl bg-slate-900/60 p-4 text-left font-mono text-sm leading-7">
                  <p><span className="text-cyan-400 font-semibold">Speaker 1:</span> Welcome to today's interview. We're here to discuss the latest developments in AI technology.</p>
                  <p className="mt-3"><span className="text-cyan-400 font-semibold">Speaker 2:</span> Thank you for having me. It's exciting to share our recent breakthroughs.</p>
                  <p className="mt-3"><span className="text-cyan-400 font-semibold">Speaker 1:</span> Let's start with your work on natural language processing...</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "✓ 99.2% Accuracy",
                    "✓ 2 Speakers Identified",
                    "✓ Auto-punctuation",
                  ].map((b) => (
                    <span key={b} className="px-2 py-1 rounded-md text-xs text-cyan-400 border border-cyan-500/40 bg-cyan-500/10">{b}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Export Formats */}
      <section className="container py-16">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-semibold">Export Formats</h2>
          <p className="text-slate-400 mt-3">Download your transcripts in any format you need</p>
        </div>
        <div className="mt-10 grid grid-cols-3 md:grid-cols-6 gap-4">
          {[
            { i: "📄", n: "TXT" },
            { i: "📝", n: "DOCX" },
            { i: "📑", n: "PDF" },
            { i: "📊", n: "SRT" },
            { i: "🎬", n: "VTT" },
            { i: "🔗", n: "JSON" },
          ].map((e) => (
            <div key={e.n} className="text-center rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-cyan-500/60 transition">
              <div className="text-3xl mb-2">{e.i}</div>
              <div className="text-slate-300 text-sm">{e.n}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Timeline */}
      <section className="py-16 bg-gradient-to-b from-slate-900 to-black" id="pricing">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-semibold">Simple, Transparent Pricing</h2>
          <p className="text-slate-400 mt-3">Choose the plan that fits your needs</p>
        </div>
        <div className="container mt-12 max-w-3xl relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 to-transparent" />
          {[
            {
              t: "Free",
              price: "$0",
              unit: "/mo",
              features: ["30 minutes free monthly", "Max 10 min per file", "98 languages supported", "TXT, SRT export formats", "7 days history"],
            },
            {
              t: "Basic",
              price: "$10",
              unit: "/mo",
              features: ["500 minutes monthly", "Max 60 min per file", "All formats (TXT, SRT, VTT, DOCX)", "Online editor access", "30 days history"],
            },
            {
              t: "Pro",
              price: "$29",
              unit: "/mo",
              features: ["2000 standard + 200 high-accuracy min", "Max 180 min (3 hours) per file", "Priority processing queue", "Advanced editor", "365 days history"],
              popular: true,
            },
          ].map((p, idx) => (
            <div key={p.t} className={`relative flex items-center gap-6 mb-10 ${idx % 2 ? "flex-row-reverse" : ""}`}>
              <div className={`flex-1 rounded-2xl border ${p.popular ? 'border-cyan-500' : 'border-slate-800'} bg-slate-900/60 p-8 hover:border-cyan-500/60 hover:scale-[1.01] transition relative`}>
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-black text-xs font-semibold rounded-full">
                    RECOMMENDED
                  </span>
                )}
                <div className="text-2xl text-cyan-400 mb-1">{p.t}</div>
                <div className="text-3xl font-bold mb-3">{p.price}<span className="text-base text-slate-400">{p.unit}</span></div>
                <ul className="text-slate-300 space-y-1">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-cyan-500 border-[6px] border-black" />
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center justify-center rounded-full px-8 py-4 text-base font-semibold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 transition-all transform hover:scale-105 shadow-lg"
          >
            View Full Pricing Plans →
          </Link>
          <p className="text-slate-400 mt-4 text-sm">Compare all features and find the perfect plan for your audio to text needs</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="container py-16 max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-semibold">Frequently Asked Questions</h2>
          <p className="text-slate-400 mt-3">Get answers to common questions about our service</p>
        </div>
        <div className="space-y-3">
          {[
            {
              q: "What audio formats are supported?",
              a: "Our audio to text converter supports all major formats including MP3, WAV, M4A, AAC, OGG, FLAC, and 40+ more.",
            },
            {
              q: "How accurate is the transcription?",
              a: "Our AI achieves 99.2% accuracy for clear recordings. Quality depends on the audio source, but handles accents well.",
            },
            {
              q: "Can you identify different speakers?",
              a: "Yes! Our system automatically detects and labels speakers, perfect for interviews and multi-person conversations.",
            },
            {
              q: "Is my data secure?",
              a: "Absolutely. All uploads are encrypted, processed securely, and automatically deleted after conversion. We never share or store your data.",
            },
            {
              q: "How long does transcription take?",
              a: "Most files are processed in under 5 minutes. A 1-hour recording typically takes just 3-4 minutes to transcribe completely.",
            },
          ].map((f) => (
            <details key={f.q} className="group rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60">
              <summary className="list-none cursor-pointer px-4 py-4 flex items-center justify-between">
                <span>{f.q}</span>
                <span className="text-cyan-400 transition group-open:rotate-45">+</span>
              </summary>
              <div className="px-4 pb-4 text-slate-300">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* Local styles for marquee animation */}
      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
}
