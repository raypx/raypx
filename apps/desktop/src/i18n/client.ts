import { normalizeLocale } from "@voidmix/i18n";
import type { Locale } from "@voidmix/i18n/types";
import {
  createLocalStorageLocaleStorage,
  useFormatter,
  useLocale,
  useSetLocale,
  useTranslations,
} from "@voidmix/i18n/client";

const localeStorage = createLocalStorageLocaleStorage();

/** Read the renderer's current preference for non-React transport code. */
export function getDesktopLocale(): Locale {
  return localeStorage.read() ?? normalizeLocale(globalThis.navigator?.language) ?? "en";
}

/** Headers shared by API clients and direct cloud requests. */
export function getDesktopLocaleHeaders(): Record<string, string> {
  return { "accept-language": getDesktopLocale() };
}

// Type-only catalog import keeps the public facade synchronized without bundling a second catalog.
import type en from "../../messages/en.json";
type Namespace = keyof typeof en;
type NamespaceKey<N extends Namespace> = keyof (typeof en)[N] & string;

export function useDesktopTranslations<N extends Namespace>(namespace: N) {
  const translate = useTranslations(namespace);
  return translate as (key: NamespaceKey<N>, values?: Record<string, unknown>) => string;
}

export { useFormatter, useLocale, useSetLocale };
