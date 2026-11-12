import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import authen from "../locales/en/index.js";
import i18nzh from "@raypx/i18n/messages/zh";
import authzh from "../locales/zh/index.js";

const en = { ...i18nen, ...authen };
const zh = { ...i18nzh, ...authzh };
export const messages = { en, zh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
