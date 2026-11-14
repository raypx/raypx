import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  chmodSync,
  statSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDaemon } from "../../../../../src/runtime/daemon/server.js";
import { daemonFetch } from "../../../../../src/runtime/daemon/endpoint.js";
import { localFetch } from "../../../../../src/runtime/local-http.js";
import { connectDesktop, desktopGateway } from "../../../../helpers/desktop-channel.js";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function fixture(beforeStart?: (directory: string) => void) {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-desktop-session-"));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  beforeStart?.(dataDir);
  const host = await startDaemon({ dataDir });
  cleanups.push(() => host.close());
  const gateway = desktopGateway(host.endpoint);
  const descriptor = await gateway.bootstrap();
  return { dataDir, host, gateway, descriptor };
}
const connect = connectDesktop.bind(undefined, cleanups);

it("bootstraps without enrollment and keeps administrative, native and renderer authority separate", async () => {
  const { host, descriptor, gateway } = await fixture();
  expect(JSON.stringify(descriptor.channel)).not.toContain(host.endpoint.token);
  expect(descriptor.channel.capability).not.toBe(descriptor.nativeCapability);
  for (const token of [descriptor.channel.capability, descriptor.nativeCapability])
    expect(
      (await localFetch(host.endpoint, "/info", { headers: { authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(403);
  expect(
    (
      await localFetch(host.endpoint, "/desktop/native", {
        method: "POST",
        headers: { authorization: `Bearer ${descriptor.channel.capability}` },
      })
    ).status,
  ).toBe(403);
  const peer = await connect(descriptor.channel);
  await peer.ready;
  expect(await peer.local("runtime.info")).toMatchObject({ protocolVersion: 1, owner: "daemon" });
  for (const method of ["visible", "device_connector_context", "release"])
    await expect(peer.request(method, {})).rejects.toMatchObject({ code: "METHOD_NOT_PERMITTED" });
  for (const method of ["roots.register", "tools.run", "agents.local.execute", "instance.begin"])
    await expect(peer.local(method)).rejects.toMatchObject({ code: "LOCAL_ERROR" });
  expect(await gateway.native(descriptor, { action: "visible", active: true })).toBe(true);
});

it("requires the exact owned page Origin and consumes each renderer capability once", async () => {
  const { descriptor } = await fixture();
  const wrong = await connect(descriptor.channel, { origin: "https://untrusted.example.test" });
  await wrong.ended;
  expect(wrong.packets).toEqual([]);
  const native = await connect(descriptor.channel, { capability: descriptor.nativeCapability });
  await native.ended;
  expect(native.packets).toEqual([]);
  const peer = await connect(descriptor.channel);
  await peer.ready;
  const replay = await connect(descriptor.channel);
  await replay.ended;
  expect(replay.packets).toEqual([]);
  expect(await peer.local("runtime.info")).toMatchObject({ protocolVersion: 1 });
});

it("replaces a renderer without stopping the independent session daemon", async () => {
  const { host, descriptor, gateway } = await fixture();
  const first = await connect(descriptor.channel);
  await first.ready;
  const next = await gateway.bootstrap();
  await first.ended;
  const second = await connect(next.channel);
  await second.ready;
  expect(await second.local("runtime.info")).toMatchObject({ owner: "daemon" });
  expect((await daemonFetch(host.endpoint, "/info")).status).toBe(200);
  await gateway.native(next, { action: "quit" });
  await second.ended;
  expect((await daemonFetch(host.endpoint, "/info")).status).toBe(200);
});

it("rejects a false cumulative ACK and closes the renderer stream", async () => {
  const { descriptor } = await fixture();
  const peer = await connect(descriptor.channel, { ack: false });
  await peer.ready;
  await expect.poll(() => peer.packets.find((p) => p.type === "event")).toBeDefined();
  const event = peer.packets.find((p) => p.type === "event")!;
  peer.socket.send(
    JSON.stringify({ type: "ack", streamId: event.streamId, sequence: event.sequence! + 1 }),
  );
  await peer.ended;
});

it("uses a separate session database and never reads or modifies earlier profile data", async () => {
  let earlier = "";
  let originalMode = 0;
  const { host, gateway } = await fixture((directory) => {
    const profile = join(directory, "profiles", "default");
    mkdirSync(profile, { recursive: true });
    earlier = join(profile, "profile.sqlite");
    writeFileSync(earlier, "opaque earlier profile");
    chmodSync(earlier, 0o644);
    originalMode = statSync(earlier).mode;
  });
  const response = await daemonFetch(host.endpoint, "/desktop", {
    action: "prepare",
    apiUrl: "https://api.example.test",
  });
  expect(await response.json()).toMatchObject({ result: { createKey: true } });
  expect(existsSync(join(host.runtime.state.directory, "desktop-session.sqlite"))).toBe(true);
  await gateway.bootstrap();
  expect(readFileSync(earlier, "utf8")).toBe("opaque earlier profile");
  expect(statSync(earlier).mode).toBe(originalMode);
});
