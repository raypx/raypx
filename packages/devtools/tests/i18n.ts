import { createBrowserI18n } from "@raypx/i18n/browser";
import i18nen from "@raypx/i18n/messages/en";
import i18nzh from "@raypx/i18n/messages/zh";

const en = { ...i18nen };
const zh = { ...i18nzh };
export const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({
  en,
  zh,
});
