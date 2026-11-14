/** Activity comes from sequenced conversation events, never metadata edits. */
export function compareLastActivity(
  left: { lastActivityAt?: string | null | undefined },
  right: { lastActivityAt?: string | null | undefined },
): number {
  const leftTime = left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0;
  const rightTime = right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0;
  return rightTime - leftTime;
}

/** Minute precision avoids announcing or repainting a conversation list every second. */
export function relativeActivityTime(value: string, locale: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (minutes === 0) return formatter.format(0, "minute");
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return formatter.format(-days, "day");
  const months = Math.floor(days / 30);
  if (days < 365) return formatter.format(-months, "month");
  return formatter.format(-Math.floor(days / 365), "year");
}
