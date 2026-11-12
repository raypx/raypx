import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import memoryen from "../locales/en/index.js";
import i18nzh from "@raypx/i18n/messages/zh";
import memoryzh from "../locales/zh/index.js";

const en = { ...i18nen, ...memoryen };
const zh = { ...i18nzh, ...memoryzh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
