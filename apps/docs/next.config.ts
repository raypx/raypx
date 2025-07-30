import withBundleAnalyzer from "@next/bundle-analyzer"
import { createMDX } from "fumadocs-mdx/next"
import type { NextConfig } from "next"

const withMDX = createMDX()

const INTERNAL_PACKAGES = [
  "@raypx/ui",
  "@raypx/auth",
  "@raypx/shared",
  "@raypx/db",
  "@raypx/redis",
  "@raypx/email",
  "@raypx/analytics",
]

let nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: INTERNAL_PACKAGES,
}

// fuma docs
nextConfig = withMDX(nextConfig)

if (process.env.ANALYZE === "true") {
  nextConfig = withBundleAnalyzer()(nextConfig)
}

export default nextConfig
