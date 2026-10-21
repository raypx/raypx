import { expect, it } from "vite-plus/test";
import { RelayHub } from "../../server/relay/hub.js";
import { ControlService } from "../../server/control/service.js";
import { connected, memoryControlRepository } from "../helpers/control.js";

it("drains in-flight device frames before disconnecting on shutdown", async () => {
  const control = new ControlService(memoryControlRepository()),
    f = await connected(control),
    id = crypto.randomUUID(),
    actor = await control.authenticate("device", f.grant.token, id);
  let blocked = false,
    release!: () => void,
    entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  const hub = new RelayHub(async (run) => {
    if (blocked) {
      entered();
      await gate;
    }
    return run(control);
  });
  hub.open({ id, send() {}, close() {} });
  await hub.receive(id, JSON.stringify({ type: "auth", role: "device", token: f.grant.token }));
  blocked = true;
  const announce = hub.receive(id, JSON.stringify(f.announce));
  await started;
  const stopped = hub.shutdown();
  release();
  await Promise.all([announce, stopped]);
  await expect(control.events(actor, f.announce.streamId, [])).rejects.toMatchObject({
    code: "DEVICE_REPLACED",
  });
});
