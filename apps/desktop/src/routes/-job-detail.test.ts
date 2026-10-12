import { describe, expect, it } from "vite-plus/test";

import { formatJobDetail } from "./-job-detail";

describe("overview job detail formatting", () => {
  const formatter = { number: (value: number) => String(value) };
  const translate = (key: string, values: Record<string, unknown>) => {
    const count = typeof values.count === "number" ? values.count : "";
    const size = typeof values.size === "string" ? values.size : "";
    return `${key}:${count}:${size}`;
  };

  it("keeps a zero byte object size visible", () => {
    expect(formatJobDetail({ kind: "objects", count: 0, sizeBytes: 0 }, translate, formatter)).toBe(
      "jobObjectsWithSize:0:0 B",
    );
  });

  it("keeps object details without a size on the object branch", () => {
    expect(formatJobDetail({ kind: "objects", count: 3 }, translate, formatter)).toBe(
      "jobObjects:3:",
    );
  });
});
