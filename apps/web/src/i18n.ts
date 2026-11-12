import { createBrowserI18n } from "@raypx/i18n/browser";
import { messages } from "#messages";
import type en from "../locales/en/index.js";

export const { BrowserLanguageProvider, preloadCatalog, useTranslations } =
  createBrowserI18n<typeof en>(messages);
