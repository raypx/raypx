import type { KnipConfig } from "knip"

const config: KnipConfig = {
  ignoreDependencies: [/@?tailwindcss.*/, "postcss", "next", "tw-animate-css"],
  workspaces: {
    ".": {
      entry: ["turbo/generators/config.ts"],
    },
    "apps/web": {
      entry: ["app/**/route.{js,jsx,ts,tsx}"],
    },
    docs: {
      entry: ["app/**/route.{js,jsx,ts,tsx}", "source.config.ts"],
    },
    "packages/ui": {
      ignore: ["src/styles/globals.css"],
    },
  },
}

export default config
