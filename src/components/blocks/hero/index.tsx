import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import HappyUsers from "./happy-users";
import HeroBg from "./bg";
import { Hero as HeroType } from "@/types/blocks/hero";
import Icon from "@/components/icon";
import { Link } from "@/i18n/navigation";
import ToolInterface from "@/components/tool-interface";
import BlurText from "./BlurText";

export default function Hero({ hero }: { hero: HeroType }) {
  if (hero.disabled) {
    return null;
  }

  const highlightText = hero.highlight_text;
  let texts = null;
  if (highlightText) {
    texts = hero.title?.split(highlightText, 2);
  }

  return (
    <>
      <HeroBg />
      <section className="py-24">
        <div className="container">
          {hero.show_badge && (
            <div className="flex items-center justify-center mb-8">
              <img
                src="/imgs/badges/phdaily.svg"
                alt="phdaily"
                className="h-10 object-cover"
              />
            </div>
          )}
          <div className="text-center">
            {hero.announcement && (
              <Link
                href={hero.announcement.url as any}
                className="mx-auto mb-3 inline-flex items-center gap-3 rounded-full border px-2 py-1 text-sm"
              >
                {hero.announcement.label && (
                  <Badge>{hero.announcement.label}</Badge>
                )}
                {hero.announcement.title}
              </Link>
            )}

            <h1 className="mx-auto mb-3 mt-4 max-w-6xl lg:mb-7 text-balance text-4xl lg:text-7xl font-extrabold tracking-[-0.03em]">
              <BlurText
                text={hero.title || ""}
                delay={120}
                animateBy="words"
                direction="top"
                className="inline"
                spanClassName="hero-title"
              />
            </h1>

            <p
              className="m mx-auto max-w-3xl text-muted-foreground lg:text-xl"
              dangerouslySetInnerHTML={{ __html: hero.description || "" }}
            />
            
            {/* 工具界面 */}
            {hero.show_tool && (
              <div className="mt-8">
                <ToolInterface 
                  mode={hero.tool_mode || "video"} 
                />
              </div>
            )}
            
            {hero.buttons && (
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                {hero.buttons.map((item, i) => {
                  return (
                    <Link
                      key={i}
                      href={item.url as any}
                      target={item.target || ""}
                      className="flex items-center"
                    >
                      <Button
                        className="w-full"
                        size="lg"
                        variant={item.variant || "default"}
                      >
                        {item.icon && <Icon name={item.icon} className="" />}
                        {item.title}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
            {hero.tip && (
              <p className="mt-8 text-md text-muted-foreground">{hero.tip}</p>
            )}
            {hero.show_happy_users && <HappyUsers />}
          </div>
        </div>
      </section>

      {/* Bottom wave - multilayer */}
      <div aria-hidden className="-z-40 relative">
        <svg viewBox="0 0 1440 220" className="w-full h-[200px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveGrad1" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="waveGrad2" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          <path d="M0,120 C240,160 480,70 720,110 C960,150 1200,200 1440,140 L1440,220 L0,220 Z" fill="url(#waveGrad1)" />
          <path d="M0,140 C240,180 480,90 720,120 C960,150 1200,210 1440,160 L1440,220 L0,220 Z" fill="url(#waveGrad2)" />
        </svg>
      </div>

    </>
  );
}
