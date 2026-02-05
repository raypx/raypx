import { routing } from "@raypx/i18n/routing";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Handle root path redirect to default locale
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/en";
    return Response.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
