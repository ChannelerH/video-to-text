"use client";

import { SessionProvider } from "next-auth/react";
import { isAuthEnabled } from "@/lib/auth";

export function NextAuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthEnabled()) {
    // Even when auth is disabled, provide a SessionProvider shell so that
    // downstream components relying on useSession() continue to receive the
    // expected context shape ({ data, status }). This prevents build-time
    // crashes during static rendering where the hook would otherwise try to
    // destructure from an undefined context value.
    return <SessionProvider session={null}>{children}</SessionProvider>;
  }

  return <SessionProvider>{children}</SessionProvider>;
}
