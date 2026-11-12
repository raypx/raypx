import { createTranslations } from "@raypx/i18n/browser";
import type i18n from "@raypx/i18n/messages/en";
import type account from "../../locales/en/index.js";
import type auth from "@raypx/auth/messages/en";

export const useTranslations = createTranslations<typeof i18n & typeof account & typeof auth>();
