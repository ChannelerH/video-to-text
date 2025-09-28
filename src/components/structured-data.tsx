export function StructuredData({ data }: { data: any }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Textuno",
  url: process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io",
  logo: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/logo.png`,
  sameAs: [
    "https://twitter.com/TextunoAI",
    "https://github.com/textunoai",
  ],
};

export const webApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Textuno Video to Text Converter",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web Browser",
  description: "Convert video to text instantly with 98.5% accuracy. AI-powered transcription in 100+ languages.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    priceValidUntil: "2025-12-31",
    description: "Free daily quota for video transcription",
  },
  provider: organizationSchema,
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "2150",
    bestRating: "5",
    worstRating: "1",
  },
  featureList: [
    "98.5% accuracy rate",
    "100+ language support",
    "Free daily quota",
    "No signup required",
    "Multiple export formats",
    "Real-time processing",
  ],
};

export const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Video to Text Transcription Service",
  serviceType: "AI Transcription",
  provider: organizationSchema,
  description: "Professional video to text conversion service with high accuracy and multi-language support",
  areaServed: {
    "@type": "Place",
    name: "Worldwide",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Transcription Services",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Video to Text Conversion",
          description: "Convert video files to accurate text transcripts",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Audio to Text Conversion",
          description: "Convert audio files to accurate text transcripts",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Subtitle Generation",
          description: "Generate subtitles in multiple formats (SRT, VTT, TXT)",
        },
      },
    ],
  },
};

export const faqSchema = (faqs: Array<{ question: string; answer: string }>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
});

export const breadcrumbSchema = (items: Array<{ name: string; url: string }>) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: item.url,
  })),
});

export const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Convert Video to Text",
  description: "Step-by-step guide to convert your videos to text using Textuno",
  image: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/tutorial-image.png`,
  totalTime: "PT2M",
  estimatedCost: {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: "0",
  },
  supply: [],
  tool: [],
  step: [
    {
      "@type": "HowToStep",
      name: "Upload Video",
      text: "Click the upload button and select your video file or paste a video URL",
      image: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/step1.png`,
    },
    {
      "@type": "HowToStep",
      name: "Select Language",
      text: "Choose the language of your video from 100+ supported languages",
      image: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/step2.png`,
    },
    {
      "@type": "HowToStep",
      name: "Start Conversion",
      text: "Click 'Convert' to start the AI-powered transcription process",
      image: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/step3.png`,
    },
    {
      "@type": "HowToStep",
      name: "Download Transcript",
      text: "Download your transcript in your preferred format (TXT, SRT, VTT)",
      image: `${process.env.NEXT_PUBLIC_WEB_URL || "https://textuno.io"}/step4.png`,
    },
  ],
};
