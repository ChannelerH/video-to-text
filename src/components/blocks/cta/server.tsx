import { Button } from "@/components/ui/button";
import Icon from "@/components/icon";
import Link from "next/link";
import { Section as SectionType } from "@/types/blocks/section";
import { RiRocketLine, RiTimeLine } from "react-icons/ri";
import { getTranslations } from "next-intl/server";

export default async function CTAServer({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }
  const t = await getTranslations('final_cta');

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="design-card text-center py-16 bg-gradient-to-b from-gray-900/50 to-gray-800/30 border-gray-700/30">
          <div className="mx-auto max-w-4xl">
            {/* Enhanced visual hierarchy */}
            <div className="mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white text-4xl mx-auto shadow-2xl">
                <RiRocketLine className="w-10 h-10" />
              </div>
            </div>

            <h2 className="design-heading-1 mb-6">
              {section.title}
            </h2>
            
            {section.description && (
              <p className="design-description mb-10">
                {section.description}
              </p>
            )}

            {/* Enhanced CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              {section.buttons?.map((button, index) => {
                const isExternal = button.url?.startsWith("http");
                const ButtonWrapper = isExternal ? "a" : Link;
                
                return (
                  <ButtonWrapper
                    key={index}
                    href={button.url}
                    {...(isExternal && { target: "_blank", rel: "noopener noreferrer" })}
                  >
                    <Button
                      variant={button.variant as any}
                      size="lg"
                      className={`h-14 px-8 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 ${
                        button.variant === 'default' 
                          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700' 
                          : ''
                      }`}
                    >
                      {button.icon && (
                        <Icon name={button.icon} className="mr-2 h-5 w-5" />
                      )}
                      {button.title}
                    </Button>
                  </ButtonWrapper>
                );
              })}
            </div>

            {/* Trust indicators */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <RiTimeLine className="w-5 h-5 text-green-500" />
                <span>{t('instant_transcription')}</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <span>{t('98_languages')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500 animate-pulse" />
                <span>{t('no_credit_card')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}