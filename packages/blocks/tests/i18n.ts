import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import blocksen from "../locales/en/index.js";
import i18nzh from "@raypx/i18n/messages/zh";
import blockszh from "../locales/zh/index.js";

const en = { ...i18nen, ...blocksen };
const zh = { ...i18nzh, ...blockszh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
