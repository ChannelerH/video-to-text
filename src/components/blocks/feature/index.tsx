import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default function Feature({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="design-heading-2">
            {section.title}
          </h2>
          <p className="design-description">
            {section.description}
          </p>
        </div>
        <div className={`design-grid ${section.items && section.items.length <= 3 ? 'design-grid-3' : section.items && section.items.length <= 6 ? 'design-grid-6' : 'design-grid-4'}`}>
          {section.items?.map((item, i) => (
            <div key={i} className="design-card flex flex-col items-center text-center">
              {/* 步骤编号（仅在3步骤时显示） */}
              {section.items && section.items.length === 3 && (
                <div className="step-number mb-4">
                  {i + 1}
                </div>
              )}
              
              {item.icon && (
                <div className="design-icon">
                  <Icon name={item.icon} className="w-8 h-8" />
                </div>
              )}
              <h3 className="design-heading-3 text-center">{item.title}</h3>
              {item.description && (
                <p className="text-gray-300 leading-relaxed">{item.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
