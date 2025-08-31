import Hero from "@/components/blocks/hero";
import Feature1 from "@/components/blocks/feature1";
import Feature from "@/components/blocks/feature";
import FAQ from "@/components/blocks/faq";
import Pricing from "@/components/blocks/pricing";
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
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/audio-to-text`;

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}/audio-to-text`;
  }

  return {
    title: "Audio to Text Online – Upload or paste MP3/M4A/WAV, free 90s preview, export TXT/SRT",
    description: "Convert audio to text instantly. Upload MP3, M4A, WAV files or paste audio links. Free 90-second preview, automatic language detection, export multiple formats.",
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
  
  const page = await getAudioPage(locale);

  return (
    <>
      {page.hero && <Hero hero={page.hero} />}
      {page.how_it_works && <Feature section={page.how_it_works} />}
      {page.tool_description && <Feature1 section={page.tool_description} />}
      {page.export_formats && <Feature section={page.export_formats} />}
      {page.pricing && <Pricing pricing={page.pricing} />}
      {page.faq && <FAQ section={page.faq} />}
    </>
  );
}