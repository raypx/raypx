import { m } from "@raypx/i18n/messages";
import { getLocale, type Locale, setLocale as setLocaleRuntime } from "@raypx/i18n/runtime";
import { get } from "lodash-es";
import { createContext, useCallback, useContext, useMemo } from "react";

type TranslateFunction = (key: string, params?: Record<string | number, unknown>) => string;

export type I18nContextType = {
  locale: string;
  setLocale: (locale: string) => void;
  createTranslateFunction: (namespace: string | undefined) => TranslateFunction;
};

export const I18nContext = createContext<I18nContextType | null>(null);

export type I18nProviderProps = {
  children: React.ReactNode;
  locale?: string;
};

const createTranslateFunction = (namespace: string | undefined) => {
  return (localeKey: string, params?: Record<string | number, unknown>) => {
    const fn: (...args: any[]) => string = get(
      m,
      namespace ? `${namespace}.${localeKey}` : localeKey,
    );
    return fn?.(...(params ? [params] : [])) ?? localeKey;
  };
};

export function I18nProvider({ children, locale }: I18nProviderProps) {
  const setLocale = useCallback((locale: string) => {
    setLocaleRuntime(locale as Locale);
  }, []);

  return (
    <I18nContext.Provider
      value={{
        locale: locale ?? getLocale(),
        setLocale,
        createTranslateFunction,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useLocale(namespace?: string) {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useLocale must be used within an I18nProvider");
  }
  const { locale, setLocale, createTranslateFunction } = context;
  const t = useMemo(() => createTranslateFunction(namespace), [createTranslateFunction, namespace]);
  return { locale, setLocale, t };
}
