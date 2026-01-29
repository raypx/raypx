import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@raypx/ui", "@raypx/auth", "@raypx/core", "@raypx/database", "@raypx/rpc"],

  // React Compiler for React 19 (moved to root in Next.js 16)
  reactCompiler: true,

  // Standalone output for Docker deployment
  output: "standalone",
};

export default nextConfig;
