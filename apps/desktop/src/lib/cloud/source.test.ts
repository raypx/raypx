import { describe, expect, it } from "vite-plus/test";
import { demoCloudSnapshot } from "./demo";
import { selectCloudSnapshot } from "./source";

describe("cloud source selection", () => {
  it("reports a missing configuration without attaching fixture data", async () => {
    await expect(selectCloudSnapshot()).resolves.toEqual({
      source: "unconfigured",
    });
  });

  it("returns remote data when the connected source loads", async () => {
    const result = await selectCloudSnapshot({
      apiUrl: "https://api.example.test",
      loadRemote: async (apiUrl) => {
        expect(apiUrl).toBe("https://api.example.test");
        return { kind: "loaded", snapshot: demoCloudSnapshot };
      },
    });

    expect(result).toEqual({ snapshot: demoCloudSnapshot, source: "cloud" });
  });

  it.each([
    ["invalid_snapshot", "unavailable"],
    ["overview_unavailable", "unavailable"],
    ["health_check_failed", "offline"],
  ] as const)("reports %s without replacing real data with fixtures", async (kind, source) => {
    const result = await selectCloudSnapshot({
      apiUrl: "https://api.example.test",
      loadRemote: async () => ({ kind }),
    });
    expect(result).toEqual({ source });
    expect(result).not.toHaveProperty("snapshot");
  });
});
