import { createContext } from "react";

type TranslateFunction = (key: string, params?: Record<string | number, unknown>) => string;

export type I18nContextType = {
  locale: string;
  setLocale: (locale: string) => void;
  createTranslateFunction: (namespace: string | undefined) => TranslateFunction;
};

export const I18nContext = createContext<I18nContextType | null>(null);

export type I18nProviderProps = I18nContextType & {
  children: React.ReactNode;
};

export function I18nProvider({
  children,
  locale,
  setLocale,
  createTranslateFunction,
}: I18nProviderProps) {
  return (
    <I18nContext.Provider value={{ locale, setLocale, createTranslateFunction }}>
      {children}
    </I18nContext.Provider>
  );
}
