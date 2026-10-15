import { createContext, use, type ReactNode } from "react";
import { I18nProvider } from "./react";
import { messages } from "./messages";
import { resolveLocalePreference, type LocalePreference } from "./preferences";

interface LanguageContextValue {
  preference: LocalePreference;
  setPreference: (value: LocalePreference) => void;
}
const Context = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({
  preference,
  systemLocale,
  onPreferenceChange,
  children,
}: {
  preference: LocalePreference;
  systemLocale: string;
  onPreferenceChange: (value: LocalePreference) => void;
  children: ReactNode;
}) {
  return (
    <Context value={{ preference, setPreference: onPreferenceChange }}>
      <I18nProvider locale={resolveLocalePreference(preference, systemLocale)} messages={messages}>
        {children}
      </I18nProvider>
    </Context>
  );
}
export function useLanguagePreference() {
  const value = use(Context);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}
