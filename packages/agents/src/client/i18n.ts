import { createTranslations } from "@raypx/i18n/browser";
import type messages from "../../locales/en/index.js";

export const useTranslations = createTranslations<typeof messages>();
