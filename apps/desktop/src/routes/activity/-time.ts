import type { Formatter } from "@voidmix/i18n";

export interface ActivityTimeInput {
  minutesAgo?: number;
  hoursAgo?: number;
  yesterday?: boolean;
}

/** Converts fixture time fields into a localized relative label without truthiness traps. */
export function formatActivityTime(
  formatter: Pick<Formatter, "relativeTime">,
  input: ActivityTimeInput,
  yesterdayLabel: string,
): string {
  if (input.yesterday) return yesterdayLabel;
  if (input.minutesAgo !== undefined) {
    return formatter.relativeTime(-input.minutesAgo, "minute");
  }
  if (input.hoursAgo !== undefined) {
    return formatter.relativeTime(-input.hoursAgo, "hour");
  }
  return "";
}
