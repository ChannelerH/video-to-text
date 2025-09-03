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
    title: "Video to Text Online – Paste a link or upload, free 90s preview, export SRT/TXT",
    description: "Convert video to text instantly. Paste YouTube links or upload MP4/MOV files. Free 90-second preview, then export as SRT, TXT, VTT, DOCX, and more formats.",
    keywords: "video to text, video transcription, YouTube to text, SRT generator, video subtitles, MP4 to text",
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
      
      {/* 2. 使用场景展示 [新增] */}
      <UseCases section={{ name: "use-cases", disabled: false }} />
      
      {/* 3. 核心数据指标 */}
      {page.stats && <Stats section={page.stats} />}
      
      {/* 4. 转写效果示例 [新增] */}
      <TranscriptionDemo section={{ name: "transcription-demo", disabled: false }} />
      
      {/* 5. Why choose us */}
      {page.core_value && <Feature1 section={page.core_value} />}
      
      {/* 6. 支持的格式和类型 [扩充] */}
      <VideoTypes section={{ name: "video-types", disabled: false }} />
      
      {/* 7. 成本对比分析 */}
      {page.service_matrix && <ComparisonTable section={page.service_matrix} />}
      
      {/* 8. 输出格式用途说明 [新增] */}
      <OutputFormats section={{ name: "output-formats", disabled: false }} />
      
      {/* 9. ROI计算器 [新增] */}
      <ROICalculator section={{ name: "roi-calculator", disabled: false }} />
      
      {/* 10. 定价方案 */}
      {page.pricing && <Pricing pricing={page.pricing} />}
      
      {/* 11. 快速开始指南 [新增] */}
      <QuickStart section={{ name: "quick-start", disabled: false }} />
      
      {/* 12. Technical Specifications */}
      <TechSpecs section={{ name: "tech-specs", disabled: false }} />
      
      {/* 13. FAQ */}
      <FAQ section={{ name: "faq", disabled: false }} />
      
      {/* 14. CTA */}
      {page.cta && <CTA section={page.cta} />}
    </>
  );
}
