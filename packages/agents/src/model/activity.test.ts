import { describe, expect, it } from "vitest";
import { compareLastActivity, relativeActivityTime } from "./activity.js";

const now = Date.parse("2026-11-14T12:00:00Z");
describe("last activity", () => {
  it("sorts active projections newest first, retains ties and puts no activity last", () => {
    const items = [
      { id: "empty", lastActivityAt: null },
      { id: "older", lastActivityAt: "2026-11-14T10:00:00Z" },
      { id: "newest", lastActivityAt: "2026-11-14T11:55:00Z" },
      { id: "same-time", lastActivityAt: "2026-11-14T10:00:00Z" },
    ];
    expect([...items].sort(compareLastActivity).map((item) => item.id)).toEqual([
      "newest",
      "older",
      "same-time",
      "empty",
    ]);
    expect(items[0]?.id).toBe("empty");
  });
  it.each([
    ["en", "5 min. ago", "2 hr. ago", "yesterday"],
    ["zh", "5分钟前", "2小时前", "昨天"],
  ])("formats relative time in %s with a fixed clock", (locale, minutes, hours, days) => {
    expect(relativeActivityTime("2026-11-14T11:55:00Z", locale, now)).toBe(minutes);
    expect(relativeActivityTime("2026-11-14T10:00:00Z", locale, now)).toBe(hours);
    expect(relativeActivityTime("2026-11-13T12:00:00Z", locale, now)).toBe(days);
    expect(relativeActivityTime("2026-11-14T12:05:00Z", locale, now)).toBe(
      relativeActivityTime("2026-11-14T12:00:00Z", locale, now),
    );
  });
});
