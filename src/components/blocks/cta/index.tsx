import { Button } from "@/components/ui/button";
import Icon from "@/components/icon";
import Link from "next/link";
import { Section as SectionType } from "@/types/blocks/section";

export default function CTA({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="design-card text-center py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="design-heading-2">
              {section.title}
            </h2>
            <p className="design-description">
              {section.description}
            </p>
            {section.buttons && (
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                {section.buttons.map((item, idx) => {
                  const isPrimary = item.variant === "default" || !item.variant;
                  return (
                    <Link
                      key={idx}
                      href={item.url || ""}
                      target={item.target}
                      className={isPrimary ? "design-btn-primary" : "design-btn-secondary"}
                    >
                      {item.title}
                      {item.icon && (
                        <Icon name={item.icon as string} className="w-5 h-5" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
