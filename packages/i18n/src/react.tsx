import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { NamespaceKeys, NestedKeyOf } from "use-intl/core";
import {
  IntlProvider as NativeIntlProvider,
  useLocale as useNativeLocale,
  useMessages as useNativeMessages,
  useTranslations as useNativeTranslations,
} from "use-intl/react";
import { formats, resolveIntlOptions } from "./formats.js";
import { isLocale } from "./locale.js";
import { resolveLocalePreference, type LocalePreference } from "./preferences.js";
import type { Translator } from "./translator.js";
import type {
  CatalogShape,
  DynamicMessages,
  IntlRuntimeOptions,
  Locale,
  MessagesByLocale,
} from "./types.js";

/** Exactly the options forwarded to use-intl; anything else must be added here first. */
type IntlProviderProps<M extends DynamicMessages> = IntlRuntimeOptions & {
  locale: Locale;
  messages: CatalogShape<M> | null;
  children?: ReactNode;
};

const providerDateTimeFormats = { ...formats.dateTime };

export function IntlProvider<M extends DynamicMessages = DynamicMessages>({
  locale,
  messages,
  children,
  formats: customFormats,
  timeZone,
  onError,
  getMessageFallback,
  now,
}: IntlProviderProps<M>) {
  if (!isLocale(locale)) throw new TypeError("Unsupported provider locale");
  const options = useMemo(
    () =>
      resolveIntlOptions({
        formats:
          customFormats === null
            ? null
            : {
                ...customFormats,
                dateTime: { ...providerDateTimeFormats, ...customFormats?.dateTime },
              },
        ...(timeZone === undefined ? {} : { timeZone }),
        ...(onError === undefined ? {} : { onError }),
        ...(getMessageFallback === undefined ? {} : { getMessageFallback }),
        ...(now === undefined ? {} : { now }),
      }),
    [customFormats, timeZone, onError, getMessageFallback, now],
  );
  return (
    <NativeIntlProvider {...options} locale={locale} messages={messages}>
      {children}
    </NativeIntlProvider>
  );
}

/** Type each feature's hook against the messages from the nearest provider. */
export function createTranslations<M extends DynamicMessages>() {
  return function useTranslations<N extends NamespaceKeys<M, NestedKeyOf<M>> = never>(
    namespace?: N,
  ): Translator<M, N> {
    return useNativeTranslations(namespace as never) as unknown as Translator<M, N>;
  };
}

export function useLocale(): Locale {
  return useNativeLocale() as Locale;
}

export function useMessages<M extends DynamicMessages = DynamicMessages>(): CatalogShape<M> {
  return useNativeMessages() as CatalogShape<M>;
}

export { useFormatter, useNow, useTimeZone } from "use-intl/react";

interface LanguagePreferenceState {
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
  hydrated: boolean;
}

const LanguageContext = createContext<LanguagePreferenceState | null>(null);

type LanguageProviderProps = Omit<
  IntlProviderProps<DynamicMessages>,
  "locale" | "messages" | "children"
> & {
  preference: LocalePreference;
  systemLocales: readonly string[];
  messages: MessagesByLocale;
  onPreferenceChange: (preference: LocalePreference) => void;
  hydrated?: boolean;
  children?: ReactNode;
};

export function LanguageProvider({
  preference,
  systemLocales,
  messages,
  onPreferenceChange,
  hydrated = true,
  children,
  ...options
}: LanguageProviderProps) {
  const locale = resolveLocalePreference(preference, systemLocales);
  const value = useMemo(
    () => ({ preference, setPreference: onPreferenceChange, hydrated }),
    [preference, onPreferenceChange, hydrated],
  );
  return (
    <LanguageContext.Provider value={value}>
      <IntlProvider {...options} locale={locale} messages={messages[locale]}>
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguagePreference(): LanguagePreferenceState {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}
