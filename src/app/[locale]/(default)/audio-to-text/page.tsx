import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import ToolInterface from "@/components/tool-interface";
import React from "react";

export const revalidate = 60;
export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/audio-to-text`;

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}/audio-to-text`;
  }

  return {
    title: "Audio to Text Online – Upload or paste MP3/M4A/WAV, free 5-minute preview, export TXT/SRT",
    description: "Convert audio to text instantly. Upload MP3, M4A, WAV files or paste audio links. Free 5-minute preview, automatic language detection, export multiple formats.",
    keywords: "audio to text, audio transcription, MP3 to text, voice to text, podcast transcription, audio subtitles",
    alternates: {
      canonical: canonicalUrl,
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
              🎯 #1 Audio Transcription Tool
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
              {page?.hero?.title || "Audio to Text — Convert audio to text & subtitles instantly"}
            </h1>
            <p className="text-slate-300 mb-8 text-base md:text-lg">
              {page?.hero?.description ||
                "Transform your audio recordings into accurate transcripts with our advanced AI. Perfect for podcasts, meetings, interviews, and lectures."}
            </p>

            <div className="flex flex-col gap-3 mb-8">
              {[
                "99.2% accuracy with speaker detection",
                "Support for 80+ languages and dialects",
                "Real-time transcription available",
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

          {/* Right - Upload widget (UI only) */}
          <div>
            <div className="relative rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-8 overflow-hidden">
              <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-40" aria-hidden>
                {/* glowing radial backdrop */}
                <div className="w-full h-full" style={{
                  background:
                    "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)",
                }} />
              </div>

              <div className="relative">
                <label className="block cursor-pointer mx-auto w-56 h-56 rounded-full border-2 border-dashed border-cyan-400/60 bg-cyan-500/10 flex flex-col items-center justify-center gap-2 text-center hover:scale-[1.02] transition-transform">
                  <div className="absolute inset-0 rounded-full animate-[pulse_2s_ease_infinite]" />
                  <div className="text-5xl">🎙️</div>
                  <div className="text-sm">Upload Audio</div>
                  <input type="file" accept="audio/*" className="hidden" />
                </label>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {[
                    { label: "📁 Browse Files" },
                    { label: "📋 Paste URL" },
                  ].map((x) => (
                    <span
                      key={x.label}
                      className="px-3 py-2 rounded-2xl text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 text-sm"
                    >
                      {x.label}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-center text-slate-400 text-sm">
                  Supports: MP3, WAV, M4A, AAC, OGG, FLAC, and more
                </p>

                <div className="mt-6 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span>Live Recording Available</span>
                  </div>
                  <button className="w-12 h-12 rounded-full bg-red-500/90 border-4 border-red-500/30 text-lg">
                    🔴
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
        <div className="container grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
          {[
            { n: "99.2%", l: "Accuracy Rate" },
            { n: "80+", l: "Languages" },
            { n: "10M+", l: "Audio Transcribed" },
            { n: "5min", l: "Average Time" },
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
          <h2 className="text-3xl md:text-4xl font-semibold">How It Works</h2>
          <p className="text-slate-400 mt-3">Simple 3-step process to get your transcripts</p>
        </div>
        <div className="relative max-w-3xl mx-auto pl-10">
          <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-cyan-400/80 to-transparent" />
          {[
            {
              t: "Upload or Record",
              d:
                "Upload your audio file in any format or record directly in your browser. Our system accepts files up to 5GB and supports batch processing.",
            },
            {
              t: "AI Processing",
              d:
                "Our advanced AI analyzes your audio, identifies different speakers, and creates accurate transcripts with proper punctuation.",
            },
            {
              t: "Download & Edit",
              d:
                "Review your transcript, make edits if needed, and export in your preferred format including TXT, DOCX, PDF, SRT, and more.",
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
            Audio to Text Online for Every Industry
          </h2>
          <p className="text-slate-400 mt-3">Trusted by professionals worldwide</p>
        </div>
        <div className="container overflow-hidden">
          <div className="flex gap-6 min-w-full will-change-transform animate-[marquee_22s_linear_infinite]">
            {[
              { icon: "🎙️", title: "Podcast Production", desc: "Create searchable show notes and transcripts for SEO." },
              { icon: "💼", title: "Business Meetings", desc: "Get accurate minutes and searchable archives." },
              { icon: "📰", title: "Journalism", desc: "Transcribe interviews and extract quotes quickly." },
              { icon: "🎓", title: "Academic Research", desc: "Lectures, interviews and focus groups transcription." },
              { icon: "⚖️", title: "Legal", desc: "Depositions and court proceedings with timestamps." },
              { icon: "🏥", title: "Healthcare", desc: "Consultations and dictations with compliance." },
              // repeat a few for continuous track
              { icon: "🎙️", title: "Podcast Production", desc: "Create searchable show notes and transcripts." },
              { icon: "💼", title: "Business Meetings", desc: "Minutes, action items, and archives." },
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
            Powerful Audio Transcription Features
          </h2>
          <p className="text-slate-400 mt-3">Everything you need for professional transcription</p>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-5 auto-rows-[200px]">
          {/* Large item */}
          <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">👥</div>
            <div className="text-cyan-400 font-semibold mb-1">Speaker Diarization</div>
            <p className="text-slate-300 text-sm">
              Automatically identify and label different speakers in your audio. Perfect for interviews, meetings, and multi-person conversations.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">🔊</div>
            <div className="text-cyan-400 font-semibold mb-1">Noise Reduction</div>
            <p className="text-slate-300 text-sm">AI-powered background noise removal for crystal clear transcripts.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">⏱️</div>
            <div className="text-cyan-400 font-semibold mb-1">Timestamps</div>
            <p className="text-slate-300 text-sm">Precise time markers for easy navigation and reference.</p>
          </div>
          <div className="md:row-span-2 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">🌍</div>
            <div className="text-cyan-400 font-semibold mb-1">Multi-Language</div>
            <p className="text-slate-300 text-sm">Support for 80+ languages with accent recognition. Transcribe content from around the world with high accuracy.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-6 hover:border-cyan-500/60 transition">
            <div className="text-3xl mb-2">📝</div>
            <div className="text-cyan-400 font-semibold mb-1">Smart Punctuation</div>
            <p className="text-slate-300 text-sm">Automatic punctuation and paragraph formatting.</p>
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
          <h2 className="text-3xl md:text-4xl font-semibold">See the Transformation</h2>
          <p className="text-slate-400 mt-3">From raw audio to polished transcript in minutes</p>
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
              unit: "/month",
              features: ["30 minutes/month", "Basic features", "3 export formats", "Community support"],
            },
            {
              t: "Pro",
              price: "$19",
              unit: "/month",
              features: ["10 hours/month", "All features unlocked", "All export formats", "Priority support", "API access"],
            },
            {
              t: "Team",
              price: "$49",
              unit: "/month",
              features: ["30 hours/month", "Team collaboration", "Advanced API access", "Dedicated support", "Custom integrations"],
            },
          ].map((p, idx) => (
            <div key={p.t} className={`relative flex items-center gap-6 mb-10 ${idx % 2 ? "flex-row-reverse" : ""}`}>
              <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 hover:border-cyan-500/60 hover:scale-[1.01] transition">
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
      </section>

      {/* FAQ */}
      <section className="container py-16 max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-semibold">Frequently Asked Questions</h2>
          <p className="text-slate-400 mt-3">Everything you need to know about audio transcription</p>
        </div>
        <div className="space-y-3">
          {[
            {
              q: "What audio formats are supported?",
              a: "We support all major audio formats including MP3, WAV, M4A, AAC, OGG, FLAC, WMA, and more. You can also paste URLs from cloud storage services or record directly in your browser.",
            },
            {
              q: "How accurate is the transcription?",
              a: "Our AI achieves 99.2% accuracy for clear audio. Accuracy may vary based on audio quality, background noise, accents, and technical terminology. Our noise reduction feature helps improve accuracy.",
            },
            {
              q: "Can I transcribe multiple speakers?",
              a: "Yes! Our speaker diarization feature automatically identifies and labels different speakers in your audio. This is perfect for interviews, meetings, podcasts, and panel discussions.",
            },
            {
              q: "Is my audio data secure?",
              a: "Absolutely. We use enterprise-grade encryption for all uploads and processing. Your files are automatically deleted after processing, and we never share your data with third parties.",
            },
            {
              q: "How long does transcription take?",
              a: "Most audio files are transcribed in less than 5 minutes. A 1-hour podcast typically takes 3-4 minutes to process. Processing time may vary based on file size and current server load.",
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
