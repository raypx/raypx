import { createTranslations } from "@raypx/i18n/browser";
import type i18n from "@raypx/i18n/messages/en";
import type tasks from "../../locales/en/index.js";
import type memory from "@raypx/memory/messages/en";

export const useTranslations = createTranslations<typeof i18n & typeof tasks & typeof memory>();
