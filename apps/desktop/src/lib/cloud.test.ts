import { describe, expect, it } from "vite-plus/test";
import { formatBytes } from "./cloud";
import { demoCloudSnapshot } from "./cloud/demo";

describe("cloud snapshot utilities", () => {
  it("formats binary storage values for compact desktop labels", () => {
    expect(formatBytes(1024 ** 3 * 1.5)).toBe("1.5 GB");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("keeps the preview snapshot internally consistent", () => {
    expect(demoCloudSnapshot.storage.used).toBeLessThan(demoCloudSnapshot.storage.total);
    expect(demoCloudSnapshot.jobs.every((job) => job.progress >= 0 && job.progress <= 100)).toBe(
      true,
    );
  });
});
