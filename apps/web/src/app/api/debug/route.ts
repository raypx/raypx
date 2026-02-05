import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const info = {
    timestamp: new Date().toISOString(),
    url: request.url,
    pathname: request.nextUrl.pathname,
    searchParams: Object.fromEntries(request.nextUrl.searchParams),
    headers: Object.fromEntries(request.headers),
    env: {
      DOCS_URL: process.env.DOCS_URL || "not set",
      NODE_ENV: process.env.NODE_ENV,
    },
  };

  console.log("[Web API Debug] Request info:", info);

  return NextResponse.json(info);
}
