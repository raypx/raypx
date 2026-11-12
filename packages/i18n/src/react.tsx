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
import type { LocalePreference } from "./preferences.js";
import type { Translator } from "./translator.js";
import type {
  CatalogShape,
  DynamicMessages,
  IntlRuntimeOptions,
  Locale,
  MessageCatalog,
} from "./types.js";

/** Forward the runtime options and use reference messages only for diagnostics. */
type IntlProviderProps<M extends DynamicMessages> = IntlRuntimeOptions & {
  locale: Locale;
  messages: CatalogShape<M> | null;
  referenceMessages?: MessageCatalog;
  children?: ReactNode;
};

const providerDateTimeFormats = { ...formats.dateTime };

export function IntlProvider<M extends DynamicMessages = DynamicMessages>({
  locale,
  messages,
  referenceMessages,
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
      resolveIntlOptions(
        locale,
        {
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
        },
        [messages, referenceMessages],
      ),
    [
      locale,
      messages,
      referenceMessages,
      customFormats,
      timeZone,
      onError,
      getMessageFallback,
      now,
    ],
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
  loadStatus: "ready" | "loading" | "failed";
  retry: () => void;
}

const LanguageContext = createContext<LanguagePreferenceState | null>(null);

type LanguageProviderProps = IntlProviderProps<DynamicMessages> & {
  preference: LocalePreference;
  onPreferenceChange: (preference: LocalePreference) => void;
  hydrated?: boolean;
  loadStatus: LanguagePreferenceState["loadStatus"];
  retry: () => void;
};

export function LanguageProvider({
  preference,
  onPreferenceChange,
  hydrated = true,
  loadStatus,
  retry,
  ...options
}: LanguageProviderProps) {
  const value = useMemo(
    () => ({ preference, setPreference: onPreferenceChange, hydrated, loadStatus, retry }),
    [preference, onPreferenceChange, hydrated, loadStatus, retry],
  );
  return (
    <LanguageContext.Provider value={value}>
      <IntlProvider {...options} />
    </LanguageContext.Provider>
  );
}

export function useLanguagePreference(): LanguagePreferenceState {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}
