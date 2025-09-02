import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Use a single recommended matcher so locale prefixes like /zh work reliably
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
