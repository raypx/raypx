import { I18nProvider as BaseI18nProvider } from "@raypx/ui/components/i18n-provider";
import { get } from "lodash-es";
import { useCallback } from "react";
import { m } from "@/lib/i18n/messages";
import { type Locale, setLocale as setLocaleRuntime } from "@/lib/i18n/runtime";

const createTranslateFunction = (namespace: string | undefined) => {
  return (localeKey: string, params?: Record<string | number, unknown>) => {
    const fn: (...args: any[]) => string = get(
      m,
      namespace ? `${namespace}.${localeKey}` : localeKey,
    );
    return fn?.(...(params ? [params] : [])) ?? localeKey;
  };
};

export type I18nProviderProps = {
  children: React.ReactNode;
  locale: string;
};

export function I18nProvider({ children, locale }: I18nProviderProps) {
  const setLocale = useCallback((locale: string) => {
    setLocaleRuntime(locale as Locale);
  }, []);

  return (
    <BaseI18nProvider
      createTranslateFunction={createTranslateFunction}
      locale={locale}
      setLocale={setLocale}
    >
      {children}
    </BaseI18nProvider>
  );
}
