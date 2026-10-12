import { createTranslator } from "@voidmix/i18n/server";
import type { Locale, Translator } from "@voidmix/i18n/types";

import en from "../messages/en.json" with { type: "json" };
import zh from "../messages/zh.json" with { type: "json" };

export const mailMessages = { en, zh } as const;
export type MailNamespace =
  | "common"
  | "passwordReset"
  | "verification"
  | "welcome"
  | "taskNotification"
  | "test";

export function createMailTranslator(namespace: MailNamespace, locale: Locale): Translator {
  return createTranslator({
    locale,
    messages: mailMessages[locale],
    namespace,
  });
}
