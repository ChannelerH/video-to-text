import Icon from "@/components/icon";
import { Section as SectionType } from "@/types/blocks/section";

export default function Feature1({ section }: { section: SectionType }) {
  if (section.disabled) {
    return null;
  }

  return (
    <section id={section.name} className="design-section">
      <div className="container">
        {section.image ? (
          // 有图片时使用左右布局
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <img
              src={section.image?.src}
              alt="placeholder hero"
              className="max-h-full w-full rounded-md object-cover"
            />
            <div className="flex flex-col lg:text-left">
              {section.title && (
                <h2 className="design-heading-2 text-left">
                  {section.title}
                </h2>
              )}
              {section.description && (
                <p className="design-description text-left mb-8">
                  {section.description}
                </p>
              )}
              <ul className="design-feature-list">
                {section.items?.map((item, i) => (
                  <li key={i} className="design-feature-item justify-start">
                    {item.icon && (
                      <div className="design-icon w-12 h-12 mr-4 shrink-0">
                        <Icon name={item.icon} className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <div className="design-heading-3 mb-2">
                        {item.title}
                      </div>
                      <div className="text-gray-300">
                        {item.description}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          // 无图片时使用居中布局
          <div className="text-center">
            {section.title && (
              <h2 className="design-heading-2">
                {section.title}
              </h2>
            )}
            {section.description && (
              <p className="design-description">
                {section.description}
              </p>
            )}
            <div className="design-grid design-grid-3">
              {section.items?.map((item, i) => (
                <div key={i} className="design-card flex flex-col items-center text-center">
                  {item.icon && (
                    <div className="design-icon">
                      <Icon name={item.icon} className="w-8 h-8" />
                    </div>
                  )}
                  <h3 className="design-heading-3">
                    {item.title}
                  </h3>
                  <p className="text-gray-300">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
