import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { AppContextProvider } from "@/contexts/app";
import { Metadata } from "next";
import { NextAuthSessionProvider } from "@/auth/session";
import IntlProvider from "@/components/i18n/intl-provider";
import { ThemeProvider } from "@/providers/theme";
import { locales } from "@/i18n/locale";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();

  return {
    title: {
      template: `%s`,
      default: t("metadata.title") || "",
    },
    description: t("metadata.description") || "",
    keywords: t("metadata.keywords") || "",
  };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const messages = await getMessages();

  const timeZone = process.env.NEXT_PUBLIC_TIME_ZONE || process.env.TIME_ZONE || 'UTC';
  return (
    <IntlProvider messages={messages} locale={locale} timeZone={timeZone}>
      <NextAuthSessionProvider>
        <AppContextProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AppContextProvider>
      </NextAuthSessionProvider>
    </IntlProvider>
  );
}
