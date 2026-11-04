import { expect, it, vi } from "vite-plus/test";
import { desktopFixture, deferred } from "../../tests/helpers/desktop";
import { createDesktopPlatform } from "./platform";

it("keeps requests and events isolated across platform instances", async () => {
  const first = desktopFixture(),
    second = desktopFixture();
  const changed = vi.fn();
  const stop = first.platform.onLocalEvent(changed);
  await Promise.all([first.platform.getBridge(), second.platform.getBridge()]);
  second.emit({ version: 1, event: "engine.status", data: { status: "error" } });
  expect(changed).not.toHaveBeenCalled();
  first.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
  expect(changed).toHaveBeenCalledOnce();
  stop();
  first.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
  expect(changed).toHaveBeenCalledOnce();
  await expect(
    first.platform.localRequest("files.list", {
      rootId: first.device.id,
      path: "",
      offset: 0,
      limit: 100,
    }),
  ).rejects.toThrow("Unexpected local request");
});

it("shares a connection attempt and permits recovery after a failed subscription", async () => {
  const fixture = desktopFixture();
  const connect = vi
    .fn()
    .mockRejectedValueOnce(new Error("subscription failed"))
    .mockResolvedValue(fixture.bridge);
  const platform = createDesktopPlatform({
    available: () => true,
    terminalHooks: () => false,
    connect,
  });
  const first = platform.getBridge(),
    concurrent = platform.getBridge();
  expect(first).toBe(concurrent);
  await expect(first).rejects.toThrow("subscription failed");
  await expect(platform.getBridge()).resolves.toBe(fixture.bridge);
  expect(connect).toHaveBeenCalledTimes(2);
});

it("keeps browser preview independent of native preferences and transport", async () => {
  const connect = vi.fn();
  const platform = createDesktopPlatform({
    available: () => false,
    terminalHooks: () => false,
    connect,
  });
  await expect(platform.saveDesktopPreferences({ theme: "dark", locale: "zh" })).resolves.toBe(
    false,
  );
  expect(() => platform.getBridge()).toThrow("DESKTOP_REQUIRED");
  expect(connect).not.toHaveBeenCalled();
});

it("serializes preference writes per platform and recovers after a rejected write", async () => {
  const fixture = desktopFixture();
  const gate = deferred<boolean>();
  const save = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(true);
  fixture.setNative("savePreferences", save);
  const first = fixture.platform.saveDesktopPreferences({ theme: "dark", locale: "zh" });
  const next = fixture.platform.saveDesktopPreferences({ theme: "light", locale: "en" });
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  gate.reject(new Error("write failed"));
  await expect(first).rejects.toThrow("write failed");
  await expect(next).resolves.toBe(true);
  expect(save.mock.calls.map(([input]) => input.theme)).toEqual(["dark", "light"]);
});
