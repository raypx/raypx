import { createFormatter as createIntlFormatter } from "use-intl/core";

import { formats } from "./formats.js";
import type { IntlRuntimeOptions, Locale } from "./types.js";

export type FormatterOptions = IntlRuntimeOptions;

export interface Formatter {
  dateTime(
    value: Date | number,
    format?: keyof typeof formats.dateTime | Intl.DateTimeFormatOptions,
  ): string;
  list(
    values: Iterable<string>,
    format?: keyof typeof formats.list | Intl.ListFormatOptions,
  ): string;
  number(
    value: bigint | number,
    format?: keyof typeof formats.number | Intl.NumberFormatOptions,
  ): string;
  relativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    format?: keyof typeof formats.relativeTime | Intl.RelativeTimeFormatOptions,
  ): string;
}

const formatterCache = new Map<string, Formatter>();

export function createFormatter(locale: Locale, options: FormatterOptions = {}): Formatter {
  const timeZone = options.timeZone ?? "UTC";
  const runtimeFormats = options.formats ?? formats;
  const cacheKey = `${locale}:${timeZone}:${runtimeFormats === formats ? "default" : JSON.stringify(runtimeFormats)}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;

  const intlFormatter = createIntlFormatter({
    locale,
    timeZone,
    formats: {
      dateTime: runtimeFormats.dateTime as never,
      list: runtimeFormats.list as never,
      number: runtimeFormats.number as never,
    },
  });
  const dateTime = intlFormatter.dateTime as unknown as (
    value: Date | number,
    format?: keyof typeof formats.dateTime | Intl.DateTimeFormatOptions,
  ) => string;
  const list = intlFormatter.list as unknown as (
    values: Iterable<string>,
    format?: keyof typeof formats.list | Intl.ListFormatOptions,
  ) => string;
  const number = intlFormatter.number as unknown as (
    value: bigint | number,
    format?: keyof typeof formats.number | Intl.NumberFormatOptions,
  ) => string;
  const relativeTime = (
    format?: keyof typeof formats.relativeTime | Intl.RelativeTimeFormatOptions,
  ) =>
    new Intl.RelativeTimeFormat(
      locale,
      typeof format === "string" ? runtimeFormats.relativeTime[format] : format,
    );

  const formatter: Formatter = {
    dateTime: (value, format) => dateTime(value, format),
    list: (values, format) => list(values, format),
    number: (value, format) => number(value, format),
    relativeTime: (value, unit, format) => relativeTime(format).format(value, unit),
  };

  formatterCache.set(cacheKey, formatter);
  return formatter;
}
