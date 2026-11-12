import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  IntlProvider as NativeIntlProvider,
  useFormatter as useNativeFormatter,
  useLocale as useNativeLocale,
  useMessages as useNativeMessages,
  useNow as useNativeNow,
  useTimeZone as useNativeTimeZone,
  useTranslations as useNativeTranslations,
} from "use-intl/react";
import type { NamespaceKeys, NestedKeyOf } from "use-intl/core";

import { mergeFormats, resolveIntlOptions } from "./formats.js";
import type { Translator } from "./translator.js";
import type {
  CatalogShape,
  DynamicMessages,
  IntlDefaults,
  LocalePreference,
  LocaleRuntime,
} from "./types.js";

export type IntlProviderProps<
  L extends string = string,
  M extends DynamicMessages = DynamicMessages,
> = Omit<ComponentProps<typeof NativeIntlProvider>, "locale" | "messages"> & {
  locale: L;
  messages: CatalogShape<M> | null;
};

export type LanguageProviderProps<
  L extends string = string,
  M extends DynamicMessages = DynamicMessages,
> = Omit<IntlProviderProps<L, M>, "locale" | "messages" | "children"> & {
  /** The stored choice; `system` follows `systemLocales`. */
  preference: LocalePreference<L>;
  /** Device languages in priority order, such as `navigator.languages`. */
  systemLocales: readonly string[];
  /** Every supported locale's current catalog. */
  messages: Readonly<Record<L, CatalogShape<M>>>;
  onPreferenceChange: (preference: LocalePreference<L>) => void;
  /** False while a server snapshot is shown before device preferences are restored. */
  hydrated?: boolean;
  children?: ReactNode;
};

export interface LanguagePreferenceState<L extends string = string> {
  preference: LocalePreference<L>;
  setPreference: (preference: LocalePreference<L>) => void;
  hydrated: boolean;
}

/** Bind types and static defaults only. Locale, catalogs and loading belong to the application. */
export function createIntlClient<M extends DynamicMessages = DynamicMessages>() {
  return function bindLocale<L extends string>(
    runtime: LocaleRuntime<L>,
    defaults: IntlDefaults = {},
  ) {
    // Copy static configuration once; there is no mutable client state or private context.
    const configuredDefaults = {
      ...defaults,
      formats: mergeFormats(defaults.formats),
    };
    function IntlProvider({
      locale,
      messages,
      children,
      formats: customFormats,
      timeZone = configuredDefaults.timeZone,
      onError = configuredDefaults.onError,
      getMessageFallback = configuredDefaults.getMessageFallback,
      now,
      ...options
    }: Omit<IntlProviderProps<L, M>, "children"> & { children?: ReactNode }) {
      if (!runtime.isLocale(locale)) throw new TypeError("Unsupported provider locale");
      const resolved = useMemo(() => {
        const formats =
          customFormats === undefined
            ? configuredDefaults.formats
            : customFormats === null
              ? null
              : {
                  dateTime: { ...configuredDefaults.formats.dateTime, ...customFormats.dateTime },
                  number: { ...configuredDefaults.formats.number, ...customFormats.number },
                  list: { ...configuredDefaults.formats.list, ...customFormats.list },
                  displayName: {
                    ...configuredDefaults.formats.displayName,
                    ...customFormats.displayName,
                  },
                };
        return resolveIntlOptions({
          formats,
          ...(timeZone === undefined ? {} : { timeZone }),
          ...(onError === undefined ? {} : { onError }),
          ...(getMessageFallback === undefined ? {} : { getMessageFallback }),
          ...(now === undefined ? {} : { now }),
        });
      }, [customFormats, timeZone, onError, getMessageFallback, now]);
      const props = { ...options, ...resolved, locale, messages, children };
      return createElement(NativeIntlProvider, props);
    }
    function useTranslations<N extends NamespaceKeys<M, NestedKeyOf<M>> = never>(
      namespace?: N,
    ): Translator<M, N> {
      // The mounted provider owns the runtime data. This bridge binds its declared catalog shape.
      return useNativeTranslations(namespace as never) as unknown as Translator<M, N>;
    }
    function useLocale(): L {
      return useNativeLocale() as L;
    }
    function useMessages(): CatalogShape<M> {
      return useNativeMessages() as CatalogShape<M>;
    }
    const LanguageContext = createContext<LanguagePreferenceState<L> | null>(null);
    /** Controlled preference provider: resolves the locale and mounts its catalog. */
    function LanguageProvider({
      preference,
      systemLocales,
      messages,
      onPreferenceChange,
      hydrated = true,
      children,
      ...options
    }: LanguageProviderProps<L, M>) {
      const locale = runtime.resolvePreference(preference, systemLocales);
      const value = useMemo(
        () => ({ preference, setPreference: onPreferenceChange, hydrated }),
        [preference, onPreferenceChange, hydrated],
      );
      return createElement(
        LanguageContext.Provider,
        { value },
        createElement(IntlProvider, { ...options, locale, messages: messages[locale] }, children),
      );
    }
    function useLanguagePreference(): LanguagePreferenceState<L> {
      const value = useContext(LanguageContext);
      if (!value) throw new Error("LanguageProvider is required");
      return value;
    }
    return {
      IntlProvider,
      LanguageProvider,
      useLanguagePreference,
      useLocale,
      useTranslations,
      useFormatter: useNativeFormatter,
      useNow: useNativeNow,
      useTimeZone: useNativeTimeZone,
      useMessages,
    };
  };
}
export type { CatalogShape, DynamicMessages, IntlDefaults } from "./types.js";
