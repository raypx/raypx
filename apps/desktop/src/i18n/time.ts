import type { Formatter } from "@voidmix/i18n";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const relativeDateLimit = 7 * day;

/** Keeps recent sync timestamps relative and uses a full date for older values. */
export function formatCloudTime(
  formatter: Pick<Formatter, "dateTime" | "relativeTime">,
  value: Date,
  now = new Date(),
): string {
  const difference = value.valueOf() - now.valueOf();
  const absoluteDifference = Math.abs(difference);

  if (absoluteDifference < minute) {
    return formatter.relativeTime(Math.round(difference / 1000), "second", "numeric");
  }
  if (absoluteDifference < hour) {
    return formatter.relativeTime(Math.round(difference / minute), "minute", "numeric");
  }
  if (absoluteDifference < day) {
    return formatter.relativeTime(Math.round(difference / hour), "hour", "numeric");
  }
  if (absoluteDifference < relativeDateLimit) {
    return formatter.relativeTime(Math.round(difference / day), "day", "numeric");
  }
  return formatter.dateTime(value, "short");
}
