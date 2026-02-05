import { defaultLocale, locales } from "@raypx/i18n/locales";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip i18n middleware for /docs paths (proxied to docs app)
  if (pathname.startsWith("/docs")) {
    console.log("[Web Middleware] Skipping i18n for docs path:", {
      pathname,
      method: request.method,
      url: request.url,
      isNextAsset: pathname.includes("/_next/"),
    });
    return;
  }

  console.log("[Web Middleware] Processing i18n:", { pathname });
  return intlMiddleware(request);
}

export const config = {
  // Match all pathnames except for
  // - … if they start with `/api`, `/_next` or `/_vercel`
  // - … the ones containing a dot (e.g. `favicon.ico`)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
