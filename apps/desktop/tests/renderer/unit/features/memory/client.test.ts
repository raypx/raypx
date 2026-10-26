import { expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@raypx/client", () => ({ createApiClient: () => ({ jobs: { list: mocks.list } }) }));
vi.mock("../../../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  desktopFetch: vi.fn(),
}));
import { memoryUsage } from "../../../../../src/features/memory/client";
it("adapts only referencing agent schedules while preserving paused-plan status", async () => {
  const id = "ABCDEFAB-1111-4111-8111-111111111111";
  mocks.list.mockResolvedValue({
    enabled: true,
    jobs: [
      {
        id: "one",
        name: "Enabled plan",
        enabled: true,
        action: {
          type: "agent.run",
          contextSelection: { sources: [{ id: id.toLowerCase(), revision: 1 }] },
        },
      },
      {
        id: "two",
        name: "Paused plan",
        enabled: false,
        action: { type: "agent.run", contextSelection: { sources: [{ id, revision: 4 }] } },
      },
      { id: "three", name: "No references", enabled: true, action: { type: "agent.run" } },
      {
        id: "four",
        name: "Other reference",
        enabled: true,
        action: {
          type: "agent.run",
          contextSelection: { sources: [{ id: crypto.randomUUID(), revision: 1 }] },
        },
      },
      {
        id: "five",
        name: "Device synchronization",
        enabled: true,
        action: { type: "device.sync" },
      },
    ],
  });
  const signal = new AbortController().signal;
  expect(await memoryUsage.scheduledPlans({ id }, { signal })).toEqual([
    { id: "one", name: "Enabled plan", enabled: true },
    { id: "two", name: "Paused plan", enabled: false },
  ]);
  expect(mocks.list).toHaveBeenCalledWith({}, { signal });
});
