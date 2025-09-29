import Hero from "@/components/blocks/hero";
import TrustIndicators from "@/components/blocks/trust-indicators";
import WorkflowSteps from "@/components/blocks/workflow-steps";
import FeatureComparison from "@/components/blocks/feature-comparison";
import TechnicalSpecs from "@/components/blocks/technical-specs";
import RealUseCases from "@/components/blocks/real-use-cases";
import PricingCTA from "@/components/blocks/pricing-cta";
import FAQ from "@/components/blocks/faq/server";
import { getLandingPage } from "@/services/page";
import { setRequestLocale } from "next-intl/server";
import { 
  StructuredData, 
  webApplicationSchema, 
  serviceSchema, 
  organizationSchema,
  howToSchema 
} from "@/components/structured-data";

export const revalidate = 60;
export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL || "https://harku.io"}`;

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}`;
  }

  const title = "Video to Text Converter - Harku AI Video to Text Tool";
  const description = "Convert video to text instantly with Harku's video to text converter. Transform any video to text with 98.5% accuracy. Our online video to text tool supports 100+ languages. Free video to text conversion - no signup needed. Start video to text transcription now.";

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
          url: `${process.env.NEXT_PUBLIC_WEB_URL || "https://harku.io"}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Harku - AI-Powered Video to Text Converter",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${process.env.NEXT_PUBLIC_WEB_URL || "https://harku.io"}/og-image.png`],
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
      {/* Structured Data for SEO */}
      <StructuredData data={organizationSchema} />
      <StructuredData data={webApplicationSchema} />
      <StructuredData data={serviceSchema} />
      <StructuredData data={howToSchema} />
      
      {/* 1. Hero - Clear value proposition */}
      {page.hero && <Hero hero={page.hero} />}

      {/* 2. Trust Indicators Bar */}
      <TrustIndicators locale={locale} />

      {/* 3. Workflow Steps with Screenshots */}
      <WorkflowSteps locale={locale} />

      {/* 4. Feature Comparison Table */}
      <FeatureComparison locale={locale} />

      {/* 5. Real Use Cases with Results */}
      <RealUseCases locale={locale} />

      {/* 6. Technical Specifications */}
      {/* <TechnicalSpecs locale={locale} /> */}

      {/* 7. Pricing CTA */}
      <PricingCTA locale={locale} />

      {/* 8. FAQ */}
      {page.faq && <FAQ section={page.faq} locale={locale} />}
    </>
  );
}
