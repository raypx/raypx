import type { SupportedLocale } from "./config";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

export type TranslationResources = typeof en;

export const resources: Record<SupportedLocale, { translation: TranslationResources }> = {
  en: { translation: en },
  zh: { translation: zh },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
};
