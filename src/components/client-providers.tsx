"use client";

import { ReactNode } from "react";
import { AppContextProvider } from "@/contexts/app";
import { ThemeProvider } from "@/providers/theme";
import MixpanelProvider from '@/providers/mixpanel-provider';

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AppContextProvider>
      <MixpanelProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </MixpanelProvider>
    </AppContextProvider>
  );
}
