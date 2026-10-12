import { DEFAULT_LOCALE, isLocale } from "@voidmix/i18n";
import type { Locale } from "@voidmix/i18n/types";

/**
 * The root error and not-found pages cannot read the `common` namespace the way
 * every other component does. Web's normal namespace entrypoints are
 * synchronous, but a recovery page must remain renderable when the application
 * chunk containing those catalogs is exactly what failed to load. So these few
 * strings are static.
 *
 * The copy is duplicated from `messages/<locale>.json`, which is a drift risk;
 * `recovery-messages.test.ts` fails if the two ever disagree.
 */
const RECOVERY_MESSAGES = {
  en: {
    refreshing: "Refreshing Voidmix…",
    pageNeedsRefresh: "This page needs a refresh",
    somethingWentWrong: "Something went wrong",
    newerPageAvailable: "A newer version of this page is available. Reload it to continue.",
    pageLoadFailed: "The page could not finish loading. Try again or return to the home page.",
    reload: "Reload page",
    tryAgain: "Try again",
    returnHome: "Return home",
    pageNotFound: "Page not found",
    pageNotFoundDescription: "The workspace page you requested does not exist.",
  },
  zh: {
    refreshing: "正在刷新 Voidmix…",
    pageNeedsRefresh: "此页面需要刷新",
    somethingWentWrong: "出错了",
    newerPageAvailable: "此页面已有新版本，请刷新后继续。",
    pageLoadFailed: "页面加载未完成，请重试或返回首页。",
    reload: "刷新页面",
    tryAgain: "重试",
    returnHome: "返回首页",
    pageNotFound: "页面不存在",
    pageNotFoundDescription: "你请求的工作区页面不存在。",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type RecoveryMessageKey = keyof (typeof RECOVERY_MESSAGES)["en"];

export const RECOVERY_MESSAGE_KEYS = Object.keys(
  RECOVERY_MESSAGES.en,
) as ReadonlyArray<RecoveryMessageKey>;

export { RECOVERY_MESSAGES };

/**
 * Reads the locale off the `<html lang>` the server already rendered. The root
 * loader's value is not reachable here: an `errorComponent` may be rendering
 * precisely because that loader failed.
 */
export function readDocumentLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export function createRecoveryTranslator(locale: Locale) {
  const messages = RECOVERY_MESSAGES[locale];
  return (key: RecoveryMessageKey): string => messages[key];
}
