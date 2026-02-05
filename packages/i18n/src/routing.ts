export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
