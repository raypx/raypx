import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: [
    "@raypx/ui",
    "@raypx/auth",
    "@raypx/core",
    "@raypx/database",
    "@raypx/rpc",
    "@raypx/i18n",
  ],

  // React Compiler for React 19 (moved to root in Next.js 16)
  reactCompiler: true,

  // Standalone output for Docker deployment
  output: "standalone",
};

export default withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})(withNextIntl(nextConfig));
