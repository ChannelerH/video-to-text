import Footer from "@/components/blocks/footer";
import Header from "@/components/blocks/header";
import { ReactNode } from "react";
import { getLandingPage } from "@/services/page";

export default async function LegalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const page = await getLandingPage(locale);

  return (
    <>
      {page.header && <Header header={page.header} />}
      <main className="overflow-x-hidden">
        <section className="design-section">
          <div className="container max-w-3xl mx-auto px-6 prose prose-slate dark:prose-invert">
            {children}
          </div>
        </section>
      </main>
      {page.footer && <Footer footer={page.footer} />}
    </>
  );
}

