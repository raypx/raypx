import { useLocales } from "expo-localization";
import { createTranslator, matchLocale } from "@raypx/i18n";
import { messages } from "../locales/index.js";
import type { AuthActionError } from "@raypx/auth/hooks";

export function useCopy() {
  const locales = useLocales();
  const locale = matchLocale(locales.map((item) => item.languageTag)) ?? "en";
  const t = createTranslator({ locale, messages: messages[locale] });
  return { locale, t };
}

export function actionErrorKey(error: AuthActionError) {
  if (error.kind === "network") return "common.networkError";
  if (error.kind !== "auth") return "common.error";
  switch (error.key) {
    case "registrationDisabled":
    case "mailUnavailable":
    case "invalidCredentials":
    case "emailNotVerified":
    case "emailTaken":
    case "passwordShort":
    case "rateLimited":
    case "invalidLink":
      return `auth.${error.key}` as const;
    case "currentPasswordInvalid":
    case "generic":
    case "invalidName":
    case "passwordLong":
    case "passwordUnavailable":
    case "sessions.expired":
      return "common.error";
  }
}
