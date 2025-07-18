import withBundleAnalyzer from "@next/bundle-analyzer"
import type { NextConfig } from "next"

let nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    "@raypx/ui",
    "@raypx/shared",
    "@raypx/analytics",
    "@raypx/auth",
    "@raypx/db",
    "@raypx/redis",
  ],
}

if (process.env.ANALYZE === "true") {
  nextConfig = withBundleAnalyzer({
    enabled: true,
  })(nextConfig)
}

export default nextConfig
