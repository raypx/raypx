import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHeaders } from "@tanstack/react-start/server";
import { resolveRequestLocale } from "@voidmix/i18n/server";
import { THEME_STORAGE_KEY, parseTheme, type UserTheme } from "@voidmix/ui/theme";

import { loadWebMessages } from "../../i18n/messages";
import type { Locale, MessageCatalog } from "@voidmix/i18n/types";

export interface RequestPreferences {
  locale: Locale;
  theme: UserTheme;
  messages: MessageCatalog;
}

/**
 * Both per-reader preferences in one server round trip, resolved before the
 * first render.
 *
 * The theme matters here for the same reason the locale does. `ThemeProvider`
 * otherwise starts at `defaultTheme` and only learns the real value in a mount
 * effect, so anything rendering from it — the theme switcher's icon and label —
 * paints the wrong value and then corrects itself on every refresh. `ThemeScript`
 * cannot prevent that: it fixes the document's own attributes before paint, not
 * React's state.
 */
export const getRequestPreferences = createServerFn({ method: "GET" }).handler(
  async (): Promise<RequestPreferences> => {
    const locale = resolveRequestLocale(getRequestHeaders());
    return {
      locale,
      theme: parseTheme(getCookie(THEME_STORAGE_KEY), "system"),
      messages: await loadWebMessages(locale),
    };
  },
);
