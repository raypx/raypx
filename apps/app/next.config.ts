import withBundleAnalyzer from "@next/bundle-analyzer"
import type { NextConfig } from "next"

let nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["prettier"],
  allowedDevOrigins: process.env.NEXT_PUBLIC_AUTH_URL
    ? [process.env.NEXT_PUBLIC_AUTH_URL]
    : [],
}

if (process.env.ANALYZE === "true") {
  nextConfig = withBundleAnalyzer({
    enabled: true,
  })(nextConfig)
}

export default nextConfig
