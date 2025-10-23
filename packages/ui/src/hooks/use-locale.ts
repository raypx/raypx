import { useContext, useMemo } from "react";
import { I18nContext } from "../components/i18n-provider";

export function useLocale(namespace?: string) {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useLocale must be used within an I18nProvider");
  }
  const { locale, setLocale, createTranslateFunction } = context;
  const t = useMemo(() => createTranslateFunction(namespace), [createTranslateFunction, namespace]);
  return { locale, setLocale, t };
}
