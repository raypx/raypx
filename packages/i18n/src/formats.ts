import type { IntlRuntimeOptions } from "@raypx-kit/intl/types";

/** Product presets, merged over the Kit defaults. `timestamp` formats absolute times. */
export const formats = {
  dateTime: { timestamp: { dateStyle: "medium", timeStyle: "short" } },
} satisfies NonNullable<IntlRuntimeOptions["formats"]>;

/** Shared by the React providers and synchronous formatters. */
export const intlDefaults = { timeZone: "UTC", formats } satisfies IntlRuntimeOptions;
