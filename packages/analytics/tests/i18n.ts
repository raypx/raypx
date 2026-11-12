import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import analyticsen from "../locales/en/index.js";
import i18nzh from "@raypx/i18n/messages/zh";
import analyticszh from "../locales/zh/index.js";

const en = { ...i18nen, ...analyticsen };
const zh = { ...i18nzh, ...analyticszh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
