import { createLocaleRuntime } from "@voidmix/intl";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
} from "./constants";

/** Product locale choices are configured once; request state stays in providers. */
export const localeRuntime = createLocaleRuntime({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  cookieName: LOCALE_COOKIE_NAME,
  cookieMaxAgeSeconds: LOCALE_COOKIE_MAX_AGE_SECONDS,
});
