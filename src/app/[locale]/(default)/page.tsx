import Hero from "@/components/blocks/hero";
import Feature1 from "@/components/blocks/feature1";
import Feature from "@/components/blocks/feature";
import Stats from "@/components/blocks/stats";
import UseCases from "@/components/blocks/use-cases";
import TranscriptionDemo from "@/components/blocks/transcription-demo";
import VideoTypes from "@/components/blocks/video-types";
import ComparisonTable from "@/components/blocks/comparison-table";
import OutputFormats from "@/components/blocks/output-formats";
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
      
      {/* 2. 应用场景展示 - What can V2TX do for you */}
      <UseCases section={{ name: "use-cases", disabled: false }} />
      
      {/* 3. 核心数据展示 - 合并Stats + Why choose us，展示专业数据和优势 */}
      {page.stats && <Stats section={page.stats} />}
      {page.core_value && <Feature1 section={page.core_value} />}
      
      {/* 4. 实际效果展示 - 真实转写样本 */}
      <TranscriptionDemo section={{ name: "transcription-demo", disabled: false }} />
      
      {/* 5. 成本计算器 - ROI分析工具 */}
      <ROICalculator section={{ name: "roi-calculator", disabled: false }} />
      
      {/* 5.5. 支持格式 - 输入/输出格式完整展示 */}
      <OutputFormats section={{ name: "output-formats", disabled: false }} />
      
      {/* 6. 定价方案 */}
      {page.pricing && <Pricing pricing={page.pricing} />}
      
      {/* 7. FAQ + CTA */}
      {page.faq && <FAQ section={page.faq} />}
      
      {/* CTA temporarily disabled - will fix data structure issue */}
      {/* <div>V2TX - Professional video to text conversion complete!</div> */}
    </>
  );
}
