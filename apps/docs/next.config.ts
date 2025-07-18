import withBundleAnalyzer from "@next/bundle-analyzer"
import { createMDX } from "fumadocs-mdx/next"
import type { NextConfig } from "next"

const withMDX = createMDX()

const INTERNAL_PACKAGES = ["@raypx/ui", "@raypx/auth", "@raypx/shared"]

let nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: INTERNAL_PACKAGES,
  serverExternalPackages: ["prettier"],
}

nextConfig = withMDX(nextConfig)

if (process.env.ANALYZE === "true") {
  nextConfig = withBundleAnalyzer()(nextConfig)
}

export default nextConfig
