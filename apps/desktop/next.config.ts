import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Tauri desktop app
  output: "export",

  // Disable server-based features for static export
  images: {
    unoptimized: true,
  },

  // React Compiler for React 19
  reactCompiler: true,
};

export default nextConfig;
