import type { useFormatter } from "@raypx/i18n/browser";

/** Seconds below a minute, then minutes, in the locale's narrow unit style. */
export function formatDuration(format: ReturnType<typeof useFormatter>, seconds: number) {
  if (seconds >= 60) {
    return format.number(seconds / 60, {
      style: "unit",
      unit: "minute",
      unitDisplay: "narrow",
      maximumFractionDigits: 1,
    });
  }
  return format.number(seconds, {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    maximumFractionDigits: seconds < 10 ? 1 : 0,
  });
}
