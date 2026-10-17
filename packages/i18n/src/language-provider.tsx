import { createContext, use, type ReactNode } from "react";
import { IntlProvider } from "./react.js";
import { messages } from "./messages/index.js";
import { resolveLocalePreference, type LocalePreference } from "./preferences.js";

interface LanguageContextValue {
  preference: LocalePreference;
  setPreference: (value: LocalePreference) => void;
  hydrated: boolean;
}
const Context = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({
  preference,
  systemLocales,
  onPreferenceChange,
  children,
  hydrated = true,
}: {
  preference: LocalePreference;
  systemLocales: readonly string[];
  onPreferenceChange: (value: LocalePreference) => void;
  children: ReactNode;
  hydrated?: boolean;
}) {
  const locale = resolveLocalePreference(preference, systemLocales);
  return (
    <Context value={{ preference, setPreference: onPreferenceChange, hydrated }}>
      <IntlProvider locale={locale} messages={messages[locale]}>
        {children}
      </IntlProvider>
    </Context>
  );
}
export function useLanguagePreference() {
  const value = use(Context);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}
