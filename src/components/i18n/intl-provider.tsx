"use client";

import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";

export default function IntlProvider({
  children,
  messages,
  locale,
  timeZone,
}: {
  children: ReactNode;
  messages: Record<string, unknown>;
  locale: string;
  timeZone?: string;
}) {
  const tz =
    timeZone ||
    process.env.NEXT_PUBLIC_TIME_ZONE ||
    process.env.TIME_ZONE ||
    'UTC';
  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
      timeZone={tz}
      now={new Date()}
      onError={(error) => {
        console.error('[IntlProvider] Translation error:', error);
      }}
      getMessageFallback={({ namespace, key }) =>
        namespace ? `${namespace}.${key}` : key
      }
    >
      {children}
    </NextIntlClientProvider>
  );
}
