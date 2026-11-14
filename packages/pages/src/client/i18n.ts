import { createTranslations } from "@raypx/i18n/browser";
import type i18n from "@raypx/i18n/messages/en";
import type pages from "../../locales/en/index.js";
export const useTranslations = createTranslations<typeof i18n & typeof pages>();
