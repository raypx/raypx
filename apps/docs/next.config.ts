import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withMDX = createMDX({
  configPath: "./source.config.ts",
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  transpilePackages: ["@raypx/ui", "@raypx/i18n"],
  basePath: "/docs",
};

export default withNextIntl(withMDX(nextConfig));
