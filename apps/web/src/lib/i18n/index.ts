import { initializeI18n } from "@raypx/i18n/client";
import dayjs from "dayjs";

import { i18nConfig } from "@/lib/i18n/config";

// Sync dayjs locale with i18n language changes
export const syncLanguage = (langKey: string) => {
  dayjs.locale(langKey);
};

// Initialize i18n with dayjs sync
const i18n = initializeI18n(i18nConfig, syncLanguage);

export default i18n;
