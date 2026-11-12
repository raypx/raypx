import type { Formats as UseIntlFormats } from "use-intl/core";

import type { IntlFormats, IntlRuntimeOptions, ResolvedIntlFormats } from "./types.js";

const formats = {
  dateTime: { short: { dateStyle: "medium" } },
  list: { conjunction: { type: "conjunction" } },
  number: { compact: { notation: "compact" } },
  displayName: {},
} as const satisfies ResolvedIntlFormats;

/** Override individual presets while preserving the other default definitions. */
export function mergeFormats(custom?: IntlFormats | null): ResolvedIntlFormats {
  if (!custom) return formats;
  return {
    dateTime: { ...formats.dateTime, ...custom.dateTime },
    list: { ...formats.list, ...custom.list },
    number: { ...formats.number, ...custom.number },
    displayName: { ...formats.displayName, ...custom.displayName },
  };
}
/** Keep preset replacement semantics when FormatJS merges its built-in styles. */
function toUseIntlFormats(custom: IntlFormats): UseIntlFormats {
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

const ignoreIntlError: NonNullable<IntlRuntimeOptions["onError"]> = () => {};
/** Shared pure configuration boundary for core factories and controlled React providers. */
export function resolveIntlOptions(options: IntlRuntimeOptions = {}) {
  return {
    timeZone: options.timeZone ?? "UTC",
    formats: toUseIntlFormats(mergeFormats(options.formats)),
    onError: options.onError ?? ignoreIntlError,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.getMessageFallback !== undefined
      ? { getMessageFallback: options.getMessageFallback }
      : {}),
  };
}
