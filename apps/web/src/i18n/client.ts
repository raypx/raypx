import {
  useFormatter,
  useLocale,
  useSetLocale,
  useTranslations as useCoreTranslations,
} from "@voidmix/i18n/client";
import type { TranslationValues } from "@voidmix/i18n";

import type en from "../../messages/en.json";

type WebCatalog = typeof en;
export type WebNamespace = keyof WebCatalog & string;
export type WebNamespaceKey<N extends WebNamespace> = keyof WebCatalog[N] & string;
export type WebTranslationValues = TranslationValues;
export type WebTranslator<N extends WebNamespace> = (
  key: WebNamespaceKey<N>,
  values?: WebTranslationValues,
) => string;

/**
 * Web's translation boundary. Namespace literals and catalog keys are checked
 * against the shipped English catalog while the runtime stays in @voidmix/i18n.
 */
export function useTranslations<N extends WebNamespace>(namespace: N): WebTranslator<N> {
  const translate = useCoreTranslations(namespace);
  return translate as unknown as WebTranslator<N>;
}

export { useFormatter, useLocale, useSetLocale };
