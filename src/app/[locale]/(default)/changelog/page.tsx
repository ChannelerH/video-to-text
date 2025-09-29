import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  RiTimeLine, 
  RiCheckLine, 
  RiSparklingLine,
  RiRocketLine,
  RiBugLine,
  RiAlertLine,
  RiStarLine,
  RiArrowRightLine
} from "react-icons/ri";

export const revalidate = 60;
export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/changelog`;

  if (locale !== "en") {
    canonicalUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}/changelog`;
  }

  return {
    title: "Changelog - Updates & Release Notes | Harku",
    description: "Stay updated with the latest features, improvements, and fixes to our video and audio transcription service.",
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

async function getChangelogData(locale: string) {
  try {
    if (locale === "zh-CN") {
      locale = "zh";
    }
    
    const data = await import(`@/i18n/pages/changelog/${locale}.json`).then(
      (module) => module.default
    );
    return data;
  } catch (error) {
    // Fallback to English if locale not found
    return await import(`@/i18n/pages/changelog/en.json`).then(
      (module) => module.default
    );
  }
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const changelog = await getChangelogData(locale);

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'feature':
        return <RiSparklingLine className="w-4 h-4" />;
      case 'improvement':
        return <RiRocketLine className="w-4 h-4" />;
      case 'fix':
        return <RiBugLine className="w-4 h-4" />;
      case 'breaking':
        return <RiAlertLine className="w-4 h-4" />;
      default:
        return <RiStarLine className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'feature':
        return "text-emerald-400";
      case 'improvement':
        return "text-blue-400";
      case 'fix':
        return "text-amber-400";
      case 'breaking':
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getTypeBgColor = (type: string) => {
    switch(type) {
      case 'feature':
        return "bg-emerald-500/10 border-emerald-500/20";
      case 'improvement':
        return "bg-blue-500/10 border-blue-500/20";
      case 'fix':
        return "bg-amber-500/10 border-amber-500/20";
      case 'breaking':
        return "bg-red-500/10 border-red-500/20";
      default:
        return "bg-gray-500/10 border-gray-500/20";
    }
  };

  const getTypeLabel = (type: string) => {
    return changelog.types[type]?.label || type;
  };

  const getTagColor = (color?: string) => {
    switch (color) {
      case "green":
        return "bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/20";
      case "blue":
        return "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 border-blue-500/30 shadow-blue-500/20";
      case "purple":
        return "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30 shadow-purple-500/20";
      default:
        return "bg-gradient-to-r from-gray-500/20 to-slate-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-gray-900 to-black" />
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:60px_60px]" />
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse [animation-delay:1000ms]" />
      </div>
      
      {/* Hero Section with enhanced animation */}
      <section className="relative overflow-hidden">
        <div className="absolute h-full w-full bg-gradient-to-b from-transparent via-black/50 to-black" />
        
        <div className="container relative py-20 md:py-32">
          <div className="text-center max-w-4xl mx-auto">
            {/* Animated badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 border border-purple-500/20 mb-8 backdrop-blur-sm bg-[length:200%_200%] animate-gradient">
              <RiTimeLine className="w-5 h-5 text-purple-400 animate-pulse" />
              <span className="text-sm text-purple-400 font-semibold uppercase tracking-wider">{changelog.title}</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent bg-[length:200%_200%] animate-gradient">
                {changelog.subtitle}
              </span>
            </h1>
            
            <p className="text-xl text-gray-400 leading-relaxed">
              {changelog.description}
            </p>

            {/* Scroll indicator */}
            <div className="mt-12 animate-bounce">
              <div className="w-8 h-12 rounded-full border-2 border-purple-500/30 mx-auto relative">
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-3 bg-purple-400 rounded-full animate-scroll-indicator" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Timeline Section */}
      <section className="container py-16 md:py-24">
        <div className="relative">
          {/* Gradient Timeline line */}
          <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 md:-translate-x-1/2">
            <div className="h-full w-full bg-gradient-to-b from-purple-500 via-blue-500 to-transparent" />
          </div>
          
          {/* Releases */}
          <div className="space-y-16 md:space-y-24">
            {changelog.releases.map((release: any, index: number) => (
              <div key={release.version} className="relative group">
                {/* Enhanced timeline dot */}
                <div className="absolute left-8 md:left-1/2 w-6 h-6 -translate-x-2.5 md:-translate-x-1/2 mt-10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-md animate-pulse" />
                    <div className="relative w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full border-2 border-background" />
                    {index === 0 && (
                      <div className="absolute inset-0 rounded-full bg-white animate-ping" />
                    )}
                  </div>
                </div>
                
                {/* Content with enhanced cards */}
                <div className={`pl-20 md:pl-0 ${index % 2 === 0 ? 'md:pr-[calc(50%-3rem)]' : 'md:pl-[calc(50%+3rem)]'}`}>
                  <Card className="relative overflow-hidden bg-gradient-to-br from-gray-900/90 via-gray-900/70 to-gray-900/90 border-gray-800 hover:border-purple-500/50 transition-all duration-500 hover:shadow-2xl hover:shadow-purple-500/10 backdrop-blur-sm group-hover:scale-[1.02]">
                    {/* Card background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative p-8 md:p-10">
                      {/* Version header with animation */}
                      <div className={`flex items-center gap-4 mb-6 ${index % 2 === 0 ? 'md:justify-end' : ''}`}>
                        <div className="flex items-baseline gap-3">
                          <span className="text-sm text-gray-500 font-medium">VERSION</span>
                          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                            {release.version}
                          </h2>
                        </div>
                        {release.tag && (
                          <Badge className={`${getTagColor(release.tagColor)} border px-3 py-1 shadow-lg animate-pulse`}>
                            {release.tag}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Date with calendar icon */}
                      <div className={`flex items-center gap-2 text-sm text-gray-500 mb-6 ${index % 2 === 0 ? 'md:justify-end' : ''}`}>
                        <RiTimeLine className="w-4 h-4" />
                        {new Date(release.date).toLocaleDateString(locale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                      
                      {/* Title & Description with better typography */}
                      <div className="mb-8">
                        <h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3">
                          {release.title}
                        </h3>
                        <p className="text-gray-400 text-lg leading-relaxed">
                          {release.description}
                        </p>
                      </div>
                      
                      <Separator className="bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-8" />
                      
                      {/* Enhanced changes list */}
                      <div className="space-y-4">
                        {release.changes.map((change: any, changeIndex: number) => (
                          <div 
                            key={changeIndex} 
                            className={`group/item flex items-start gap-4 p-4 rounded-xl hover:bg-gray-800/30 transition-all duration-300 ${
                              index % 2 === 0 ? 'md:flex-row-reverse md:text-right' : ''
                            }`}
                          >
                            <div className={`flex-shrink-0 w-10 h-10 rounded-xl border ${getTypeBgColor(change.type)} flex items-center justify-center group-hover/item:scale-110 transition-transform ${
                              index % 2 === 0 ? 'md:ml-4 md:mr-0' : ''
                            }`}>
                              <span className={getTypeColor(change.type)}>
                                {getTypeIcon(change.type)}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className={`flex items-center gap-3 mb-2 ${index % 2 === 0 ? 'md:justify-end' : ''}`}>
                                <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getTypeBgColor(change.type)} ${getTypeColor(change.type)} border`}>
                                  {getTypeLabel(change.type)}
                                </Badge>
                                <span className="text-base font-semibold text-white group-hover/item:text-purple-400 transition-colors">
                                  {change.title}
                                </span>
                              </div>
                              <p className="text-sm text-gray-400 leading-relaxed">
                                {change.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ))}
          </div>
          
          {/* Enhanced end of timeline */}
          <div className="absolute left-8 md:left-1/2 -bottom-8 -translate-x-4 md:-translate-x-1/2">
            <div className="relative">
              <div className="absolute inset-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-xl animate-pulse" />
              <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl">
                <RiCheckLine className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enhanced Bottom CTA */}
      <section className="container py-20 md:py-32">
        <div className="text-center">
          <Card className="relative max-w-3xl mx-auto p-10 md:p-12 overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-900/10 via-gray-900/50 to-blue-900/10 backdrop-blur-sm">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10 bg-[length:200%_200%] animate-gradient" />
            
            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 mb-6 mx-auto shadow-2xl">
                <RiSparklingLine className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {locale === 'zh' ? '保持更新' : 'Stay Updated'}
              </h3>
              <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
                {locale === 'zh' 
                  ? '订阅我们的通讯，第一时间了解新功能和更新'
                  : 'Subscribe to our newsletter to be the first to know about new features and updates'}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="/"
                  className="group inline-flex items-center justify-center px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:shadow-2xl hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105"
                >
                  {locale === 'zh' ? '返回首页' : 'Back to Home'}
                </a>
                <a
                  href={`/${locale}/dashboard`}
                  className="group inline-flex items-center justify-center px-8 py-4 rounded-full border-2 border-purple-500 text-purple-400 font-semibold hover:bg-purple-500/10 hover:border-purple-400 transition-all duration-300"
                >
                  {locale === 'zh' ? '开始使用' : 'Get Started'}
                  <RiArrowRightLine className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}