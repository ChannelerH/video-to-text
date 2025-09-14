"use client";

import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";

export default function IntlProvider({
  children,
  messages,
  locale,
}: {
  children: ReactNode;
  messages: Record<string, unknown>;
  locale: string;
}) {
  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
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
