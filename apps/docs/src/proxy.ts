import { routing } from "@raypx/i18n/routing";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

const VALID_LOCALES = new Set(routing.locales);
const intlMiddleware = createMiddleware(routing);

/**
 * Reject browser/extension noise (e.g. .well-known, appspecific, Chrome DevTools)
 * before they hit the docs page and clutter logs.
 */
function isInvalidFirstSegment(pathname: string): boolean {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return false;
  return !VALID_LOCALES.has(segment as "en" | "zh");
}

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const pathWithoutBase = pathname.replace(/^\/docs/, "") || "/";

  // Handle root path redirect to default locale
  if (pathWithoutBase === "/" || pathWithoutBase === "") {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/docs") ? "/docs/en" : "/en";
    return NextResponse.redirect(url);
  }

  // Block non-locale first segments (e.g. .well-known, appspecific) early → 404, no logs
  if (isInvalidFirstSegment(pathWithoutBase)) {
    return new NextResponse(null, { status: 404 });
  }

  return intlMiddleware(request);
}

// Match all paths except api, _next, _vercel so we can 404 .well-known etc. early
export const config = {
  matcher: ["/((?!api|_next|_vercel).*)"],
};
