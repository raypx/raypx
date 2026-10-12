import { describe, expect, it } from "vite-plus/test";

import { formatActivityTime } from "./-time";

describe("activity time formatting", () => {
  const formatter = {
    relativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => `${value} ${unit}`,
  };

  it("keeps zero minutes as a valid relative value", () => {
    expect(formatActivityTime(formatter, { minutesAgo: 0 }, "yesterday")).toBe("0 minute");
  });

  it("uses the available fallback unit", () => {
    expect(formatActivityTime(formatter, { hoursAgo: 2 }, "yesterday")).toBe("-2 hour");
    expect(formatActivityTime(formatter, { yesterday: true }, "yesterday")).toBe("yesterday");
  });
});
