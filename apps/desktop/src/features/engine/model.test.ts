import { expect, it } from "vite-plus/test";
import { desktopFixture, deferred } from "../../../tests/helpers/desktop";
import { createEngineController } from "./model";

it("keeps an authoritative engine event when an older initial read finishes later", async () => {
  const fixture = desktopFixture();
  const pending = deferred<typeof fixture.runtime>();
  fixture.setNative("getRuntime", () => pending.promise);
  const controller = createEngineController(fixture.platform);
  const stop = controller.connect();
  await fixture.platform.getBridge();
  fixture.emit({
    version: 1,
    event: "engine.status",
    data: { status: "error", code: "HOST_VERSION_MISMATCH" },
  });
  pending.resolve({ ...fixture.runtime, engine: { status: "starting" } });
  await pending.promise;
  await Promise.resolve();
  expect(controller.getSnapshot().engine).toEqual({
    status: "error",
    code: "HOST_VERSION_MISMATCH",
  });
  stop();
});

it("ignores reads and events after disposal, and reconnects with a fresh lifetime", async () => {
  const fixture = desktopFixture();
  const pending = deferred<typeof fixture.runtime>();
  fixture.setNative("getRuntime", () => pending.promise);
  const controller = createEngineController(fixture.platform);
  const stop = controller.connect();
  await fixture.platform.getBridge();
  stop();
  const snapshot = controller.getSnapshot();
  pending.resolve(fixture.runtime);
  await pending.promise;
  fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } });
  expect(controller.getSnapshot()).toBe(snapshot);
  fixture.setNative("getRuntime", async () => fixture.runtime);
  const close = controller.connect();
  await controller.refresh();
  expect(controller.getSnapshot().engine.status).toBe("ready");
  close();
});
