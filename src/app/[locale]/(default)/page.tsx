import Hero from "@/components/blocks/hero";
import Feature1 from "@/components/blocks/feature1";
import Feature from "@/components/blocks/feature";
import Stats from "@/components/blocks/stats/simple-server";
import UseCases from "@/components/blocks/use-cases/server";
import TranscriptionDemo from "@/components/blocks/transcription-demo/server";
import WhyChooseUs from "@/components/blocks/why-choose-us/server";
import VideoTypes from "@/components/blocks/video-types";
import ComparisonTable from "@/components/blocks/comparison-table";
import ROICalculator from "@/components/blocks/roi-calculator/server";
import TechSpecs from "@/components/blocks/tech-specs";
import QuickStart from "@/components/blocks/quick-start";
import PricingCTA from "@/components/blocks/pricing-cta";
import FAQ from "@/components/blocks/faq/server";
import CTA from "@/components/blocks/cta/server";
import { getTranslations } from "next-intl/server";
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
    title: "Video to Text Converter - AI Transcription in Minutes | V2TX",
    description: "Convert videos to text with 95% accuracy. Free 10 mins daily. No credit card required. Supports YouTube, MP4, 100+ languages. Powered by OpenAI Whisper.",
    keywords: "",
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
  const t = await getTranslations();

  return (
    <>
      {/* 1. Hero区（转换工具） */}
      {page.hero && <Hero hero={page.hero} />}
      
      {/* 2. 信任指标（关键数据） */}
      {page.stats && <Stats section={page.stats} locale={locale} />}

      {/* 3. 使用场景（核心场景） */}
      <UseCases section={{ name: "use-cases", disabled: false }} locale={locale} />

      {/* 4. 效果展示（真实转写样本） */}
      <TranscriptionDemo section={{ name: "transcription-demo", disabled: false }} locale={locale} />

      {/* 5. 竞争优势（为什么选择我们） */}
      <WhyChooseUs section={{ name: "why-choose-us", disabled: false }} locale={locale} />

      {/* 6. 成本分析（ROI） */}
      <ROICalculator section={{ name: "roi-calculator", disabled: false }} locale={locale} />

      {/* 7. 定价引导 */}
      <PricingCTA locale={locale} />

      {/* 8. FAQ 精选 */}
      {page.faq && <FAQ section={page.faq} locale={locale} />}

      {/* 9. 收尾 CTA */}
      <CTA
        section={{
          name: "final-cta",
          disabled: false,
          title: t("final_cta.title"),
          description: t("final_cta.description"),
          buttons: [{ title: t("final_cta.get_started"), url: "#", variant: "default" }],
        }}
      />
    </>
  );
}
