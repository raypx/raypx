import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import jobsen from "../locales/en/index.js";
import memoryen from "@raypx/memory/messages/en";
import i18nzh from "@raypx/i18n/messages/zh";
import jobszh from "../locales/zh/index.js";
import memoryzh from "@raypx/memory/messages/zh";

const en = { ...i18nen, ...jobsen, ...memoryen };
const zh = { ...i18nzh, ...jobszh, ...memoryzh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
