import type { Formats as UseIntlFormats } from "use-intl/core";

import type { IntlRuntimeOptions } from "./types.js";
import { intlErrorHandlers } from "./diagnostics.js";

type ResolvedIntlFormats = { [K in keyof UseIntlFormats]-?: NonNullable<UseIntlFormats[K]> };

const presets = {
  dateTime: {
    short: { dateStyle: "medium" },
    timestamp: { dateStyle: "medium", timeStyle: "short" },
  },
  list: { conjunction: { type: "conjunction" } },
  number: { compact: { notation: "compact" } },
  displayName: {},
} as const satisfies ResolvedIntlFormats;

// The standalone translator uses the base presets. Formatters and providers add timestamp.
const defaultFormats = { ...presets, dateTime: { short: presets.dateTime.short } };

/** Product preset for formatting absolute times. */
export const formats = {
  dateTime: { timestamp: { ...presets.dateTime.timestamp } },
} satisfies UseIntlFormats;

/** Override individual presets while preserving the other default definitions. */
function mergeFormats(custom?: UseIntlFormats | null): ResolvedIntlFormats {
  if (!custom) return defaultFormats;
  return {
    dateTime: { ...defaultFormats.dateTime, ...custom.dateTime },
    list: { ...defaultFormats.list, ...custom.list },
    number: { ...defaultFormats.number, ...custom.number },
    displayName: { ...defaultFormats.displayName, ...custom.displayName },
  };
}
/** Keep preset replacement semantics when FormatJS merges its built-in styles. */
function toUseIntlFormats(custom: UseIntlFormats): UseIntlFormats {
  return {
    ...custom,
    ...(custom.dateTime && {
      dateTime: Object.fromEntries(
        Object.entries(custom.dateTime).map(([name, options]) => [
          name,
          {
            year: undefined,
            month: undefined,
            day: undefined,
            weekday: undefined,
            hour: undefined,
            minute: undefined,
            second: undefined,
            timeZoneName: undefined,
            ...options,
          },
        ]),
      ),
    }),
    ...(custom.number && {
      number: Object.fromEntries(
        Object.entries(custom.number).map(([name, options]) => [
          name,
          { style: undefined, maximumFractionDigits: undefined, ...options },
        ]),
      ),
    }),
  } as UseIntlFormats;
}

/** Shared pure configuration boundary for core factories and controlled React providers. */
export function resolveIntlOptions(
  locale: string,
  options: IntlRuntimeOptions = {},
  catalogs: readonly unknown[] = [],
) {
  return {
    timeZone: options.timeZone ?? "UTC",
    formats: toUseIntlFormats(mergeFormats(options.formats)),
    ...intlErrorHandlers(locale, options, catalogs),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}
