import type { InstanceBinding } from "@raypx/instances";
import { createInstanceKey, createInstanceSigner } from "@raypx/instances/crypto";
import { expect, it } from "vite-plus/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../../src/runtime/daemon/server.js";
import { instanceKeys } from "../../../../src/runtime/instances/keys.js";
import { createDaemonClient } from "../../../../src/transport/daemon-client.js";
import { removeTemporaryDirectory } from "../../../helpers/temporary.js";

async function fixture(state: "unregistered" | "registered" | "revoked") {
  const dataDir = await mkdtemp(join(tmpdir(), "raypx-daemon-tools-"));
  let host: Awaited<ReturnType<typeof startDaemon>> | undefined;
  const clients: Awaited<ReturnType<typeof createDaemonClient>>[] = [];
  const close = async () => {
    try {
      await Promise.all(clients.map((client) => client.close()));
    } finally {
      try {
        await host?.close();
      } finally {
        await removeTemporaryDirectory(dataDir);
      }
    }
  };
  const connect = async () => {
    const client = await createDaemonClient({ dataDir }, false);
    clients.push(client);
    return client;
  };
  try {
    host = await startDaemon({ dataDir });
    const client = await connect();
    // Drain startup refresh before installing a signed offline fixture identity.
    await client.request("instance.refresh", {});
    if (state !== "unregistered") {
      const key = createInstanceKey();
      const binding: InstanceBinding = {
        version: 1,
        origin: "https://account.example",
        accountId: "fixture-owner",
        instanceId: crypto.randomUUID(),
        publicKey: key.publicKey,
        name: "Daemon fixture",
        platform: process.platform,
        appVersion: "0.1.0",
        revision: state === "revoked" ? 2 : 1,
        status: state,
        issuedAt: new Date().toISOString(),
      };
      await instanceKeys(host.runtime.state.db).set(binding.instanceId, key.privateKey);
      await writeFile(
        join(host.runtime.state.directory, "instance.json"),
        JSON.stringify(createInstanceSigner("daemon-tools-fixture").issue(binding)),
        { mode: 0o600 },
      );
    }
    expect(await client.request("instance.status", {})).toMatchObject({ state });
    return { dataDir, client, connect, close };
  } catch (error) {
    await close();
    throw error;
  }
}

it.each([
  ["unregistered", "INSTANCE_ENROLLMENT_REQUIRED"],
  ["revoked", "INSTANCE_REVOKED"],
] as const)(
  "rejects daemon tools when the instance is %s before starting a process",
  async (state, code) => {
    const f = await fixture(state);
    const marker = join(f.dataDir, "unexpected-command");
    try {
      await expect(
        f.client.request("tools.run", {
          executable: process.execPath,
          args: ["-e", "await Bun.write(process.argv.at(-1), 'started')", marker],
          cwd: f.dataDir,
        }),
      ).rejects.toMatchObject({ code });
      expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
      await f.close();
    }
  },
);

it("runs tools offline and cancels a disconnected client's command while keeping other clients usable", async () => {
  const f = await fixture("registered");
  const started = join(f.dataDir, "started");
  const id = crypto.randomUUID();
  try {
    expect(
      await f.client.request("tools.run", {
        executable: process.execPath,
        args: ["-e", "console.log('offline command')"],
        cwd: f.dataDir,
      }),
    ).toMatchObject({ exitCode: 0, output: "offline command\n", cancelled: false });
    const observer = await f.connect();
    let finished: Record<string, unknown> | undefined;
    observer.subscribe((event) => {
      if (event.event === "tool.finished" && event.data.id === id) finished = event.data;
    });
    const work = f.client
      .request("tools.run", {
        id,
        executable: process.execPath,
        args: [
          "-e",
          "await Bun.write(process.argv.at(-1), 'started'); setInterval(() => {}, 1000)",
          started,
        ],
        cwd: f.dataDir,
      })
      .catch((error: unknown) => error);
    await expect.poll(() => Bun.file(started).exists()).toBe(true);
    await f.client.close();
    await work;
    await expect.poll(() => finished).toMatchObject({ id, cancelled: true });
    expect(
      await observer.request("tools.run", {
        executable: process.execPath,
        args: ["-e", "console.log('remaining client')"],
        cwd: f.dataDir,
      }),
    ).toMatchObject({ exitCode: 0, output: "remaining client\n", cancelled: false });
  } finally {
    await f.close();
  }
});
