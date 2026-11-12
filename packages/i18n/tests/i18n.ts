import { createBrowserI18n } from "../src/browser.js";
import i18nen from "../locales/en/index.js";
import i18nzh from "../locales/zh/index.js";

const en = { ...i18nen };
const zh = { ...i18nzh };
export const { BrowserLanguageProvider, useTranslations } = createBrowserI18n<typeof en>({
  en,
  zh,
});
