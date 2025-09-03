import Hero from "@/components/blocks/hero";
import Feature1 from "@/components/blocks/feature1";
import Feature from "@/components/blocks/feature";
import Stats from "@/components/blocks/stats";
import UseCases from "@/components/blocks/use-cases";
import TranscriptionDemo from "@/components/blocks/transcription-demo";
import VideoTypes from "@/components/blocks/video-types";
import ComparisonTable from "@/components/blocks/comparison-table";
import ROICalculator from "@/components/blocks/roi-calculator";
import TechSpecs from "@/components/blocks/tech-specs";
import Pricing from "@/components/blocks/pricing";
import QuickStart from "@/components/blocks/quick-start";
import FAQ from "@/components/blocks/faq";
import CTA from "@/components/blocks/cta";
// Added new core content modules for Video to Text functionality
import { getLandingPage } from "@/services/page";
import { setRequestLocale } from "next-intl/server";

export const revalidate = 60;
export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}`;

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}`;
  }

  return {
    title: "V2TX - Video to Text Converter Online | Free 90s Preview, Export SRT/TXT",
    description: "V2TX: Best video to text converter. Convert videos to text instantly with our AI-powered tool. Paste YouTube links or upload MP4/MOV files. Free 90-second preview, then export as SRT, TXT, VTT, DOCX formats.",
    keywords: "V2TX, video to text, video to text converter, video transcription, YouTube to text, SRT generator, video subtitles, MP4 to text, video to text online, AI video transcription",
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function VideoToTextPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  
  const page = await getLandingPage(locale);

  return (
    <>
      {/* 1. Hero区（转换工具） */}
      {page.hero && <Hero hero={page.hero} />}
      
      {/* 2. 信任指标（关键数据） */}
      {page.stats && <Stats section={page.stats} />}

      {/* 3. 使用场景（核心场景） */}
      <UseCases section={{ name: "use-cases", disabled: false }} />

      {/* 4. 效果展示（真实转写样本） */}
      <TranscriptionDemo section={{ name: "transcription-demo", disabled: false }} />

      {/* 5. 成本分析（ROI） */}
      <ROICalculator section={{ name: "roi-calculator", disabled: false }} />

      {/* 6. 定价方案（精简版） */}
      {page.pricing && <Pricing pricing={page.pricing} />}

      {/* 7. FAQ 精选 */}
      {page.faq && <FAQ section={page.faq} />}

      {/* 8. 收尾 CTA */}
      <CTA section={{ name: "final-cta", disabled: false, title: "Ready to transcribe your first video?", description: "Start with a free 90s preview. Upgrade anytime for full features.", buttons: [{ title: "Get Started", url: "#", variant: "default"}] }} />
    </>
  );
}
