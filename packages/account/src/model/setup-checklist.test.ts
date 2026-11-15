import { expect, it, vi } from "vitest";
import { accessForRole } from "../access.js";
import { SetupChecklistController, setupDismissalKey } from "./setup-checklist.js";

function fixture() {
  const storage = new Map<string, string>();
  const port = {
    access: vi.fn(async () => accessForRole("admin", "admin")),
    status: vi.fn(async () => ({ model: false, sandbox: false, mail: false })),
  };
  const preferences = {
    read: (key: string) => storage.get(key) ?? null,
    write: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  function controller(origin = "https://a.example.test", accountId = "admin") {
    return new SetupChecklistController(port, origin, accountId, preferences);
  }
  return { port, storage, preferences, controller };
}
it("reads no administrator status for guests, members or mismatched accounts", async () => {
  const f = fixture();
  for (const access of [
    accessForRole("guest", null),
    accessForRole("member", "admin"),
    accessForRole("admin", "other"),
  ]) {
    f.port.access.mockResolvedValue(access);
    const model = f.controller();
    await model.refresh();
    expect(model.getSnapshot()).toEqual({ status: "hidden" });
  }
  expect(f.port.status).not.toHaveBeenCalled();
});
it("refreshes server state, hides complete setup and clears revoked authority", async () => {
  const f = fixture();
  const model = f.controller();
  await model.refresh();
  expect(model.getSnapshot()).toMatchObject({ status: "ready", configuration: { model: false } });
  f.port.status.mockResolvedValue({ model: true, sandbox: true, mail: true });
  await model.refresh();
  expect(model.getSnapshot()).toEqual({ status: "hidden" });
  f.port.status.mockResolvedValue({ model: false, sandbox: true, mail: true });
  await model.refresh();
  expect(model.getSnapshot()).toMatchObject({ status: "ready" });
  f.port.access.mockResolvedValue(accessForRole("member", "admin"));
  await model.refresh();
  expect(model.getSnapshot()).toEqual({ status: "hidden" });
});
it("persists only dismissal, isolated by origin and account across mounts", async () => {
  const f = fixture();
  const model = f.controller();
  await model.refresh();
  model.dismiss();
  expect([...f.storage.entries()]).toEqual([
    [setupDismissalKey("https://a.example.test", "admin"), "true"],
  ]);
  f.port.status.mockClear();
  const restored = f.controller();
  await restored.refresh();
  expect(restored.getSnapshot()).toEqual({ status: "hidden" });
  expect(f.port.status).not.toHaveBeenCalled();
  const otherOrigin = f.controller("https://b.example.test");
  await otherOrigin.refresh();
  expect(otherOrigin.getSnapshot()).toMatchObject({ status: "ready" });
  f.port.access.mockResolvedValue(accessForRole("admin", "other"));
  const otherAccount = f.controller(undefined, "other");
  await otherAccount.refresh();
  expect(otherAccount.getSnapshot()).toMatchObject({ status: "ready" });
});
it("keeps read failures unavailable, supports retry and tolerates blocked preferences", async () => {
  const f = fixture();
  f.preferences.read = () => {
    throw new Error("blocked");
  };
  f.preferences.write = () => {
    throw new Error("blocked");
  };
  const model = f.controller();
  f.port.status.mockRejectedValueOnce(new Error("private diagnostics"));
  await model.refresh();
  expect(model.getSnapshot()).toEqual({ status: "unavailable" });
  await model.refresh();
  expect(model.getSnapshot()).toMatchObject({ status: "ready" });
  model.dismiss();
  await model.refresh();
  expect(model.getSnapshot()).toEqual({ status: "hidden" });
});
it("fences a delayed response after dismissal or disposal", async () => {
  const f = fixture();
  let finish!: (value: { model: boolean; sandbox: boolean; mail: boolean }) => void;
  f.port.status.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const model = f.controller();
  const pending = model.refresh();
  await vi.waitFor(() => expect(finish).toBeDefined());
  model.dismiss();
  finish({ model: false, sandbox: false, mail: false });
  await pending;
  expect(model.getSnapshot()).toEqual({ status: "hidden" });
});
