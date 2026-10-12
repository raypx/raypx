import { describe, expect, it, vi } from "vite-plus/test";

import { formatCloudTime } from "./time";

const now = new Date("2026-09-09T12:00:00.000Z");

function createFormatter() {
  return {
    relativeTime: vi.fn(
      (
        value: number,
        unit: Intl.RelativeTimeFormatUnit,
        format?: "numeric" | Intl.RelativeTimeFormatOptions,
      ) => `${value}:${unit}:${typeof format === "string" ? format : "options"}`,
    ),
    dateTime: vi.fn(() => "absolute date"),
  };
}

describe("cloud timestamp formatting", () => {
  it.each([
    ["minutes", "2026-09-09T11:52:00.000Z", "-8:minute:numeric"],
    ["hours", "2026-09-09T10:00:00.000Z", "-2:hour:numeric"],
    ["recent cross-day", "2026-09-08T12:00:00.000Z", "-1:day:numeric"],
    ["older absolute", "2026-08-30T12:00:00.000Z", "absolute date"],
  ])("formats %s timestamps", (_name, timestamp, label) => {
    const formatter = createFormatter();
    const date = new Date(timestamp);
    expect(formatCloudTime(formatter, date, now)).toBe(label);
    if (label === "absolute date") expect(formatter.dateTime).toHaveBeenCalledWith(date, "short");
    else expect(formatter.dateTime).not.toHaveBeenCalled();
  });
});
