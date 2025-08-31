import Hero from "@/components/blocks/hero";
import Feature1 from "@/components/blocks/feature1";
import Feature from "@/components/blocks/feature";
import FAQ from "@/components/blocks/faq";
import Pricing from "@/components/blocks/pricing";
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
      {page.hero && <Hero hero={page.hero} />}
      {page.how_it_works && <Feature section={page.how_it_works} />}
      {page.tool_description && <Feature1 section={page.tool_description} />}
      {page.export_formats && <Feature section={page.export_formats} />}
      {page.pricing && <Pricing pricing={page.pricing} />}
      {page.faq && <FAQ section={page.faq} />}
    </>
  );
}
