import type { InstanceBinding } from "@raypx/instances";
import type { EnrollmentRecord } from "@raypx/instances/server";
import { expect, it, vi } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InstanceRuntime } from "../../../src/runtime/instances/index.js";
import {
  createInstanceKey,
  createInstanceSigner,
  instanceDigest,
  verifyProof,
} from "@raypx/instances/crypto";
import { createRuntime } from "../../../src/runtime/index.js";
import { ProfileStorage } from "../../../src/runtime/sqlite/index.js";
import { instanceKeys } from "../../../src/runtime/instances/keys.js";
it("keeps an enrolled profile usable offline and rejects revocation and corrupted or missing keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raypx-instance-")),
    keys = createInstanceKey(),
    signer = createInstanceSigner("fixture"),
    id = crypto.randomUUID();
  const receipt = signer.issue({
    version: 1,
    origin: "https://account.example",
    accountId: "owner",
    instanceId: id,
    publicKey: keys.publicKey,
    name: "Fixture",
    platform: "linux",
    appVersion: "0.1.0",
    revision: 1,
    status: "registered",
    issuedAt: new Date().toISOString(),
  });
  let key: string | undefined = keys.privateKey;
  const runtime = new InstanceRuntime(dir, {
    keys: {
      get: async () => key,
      set: async (_id, value) => {
        key = value;
      },
    },
  });
  try {
    expect(await runtime.status()).toEqual({ state: "unregistered" });
    await writeFile(join(dir, "instance.json"), JSON.stringify(receipt));
    await expect(runtime.assert()).resolves.toBeUndefined();
    await expect(runtime.begin("https://other.example")).rejects.toMatchObject({
      code: "INSTANCE_OWNER_MISMATCH",
    });
    key = undefined;
    expect((await runtime.status()).state).toBe("unavailable");
    key = keys.privateKey;
    await writeFile(
      join(dir, "instance.json"),
      JSON.stringify(signer.issue({ ...receipt.binding, status: "revoked", revision: 2 })),
    );
    await expect(runtime.assert()).rejects.toMatchObject({ code: "INSTANCE_REVOKED" });
    await writeFile(join(dir, "instance.json"), "{}");
    expect((await runtime.status()).state).toBe("unavailable");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects unregistered IPC work while allowing readiness and enrollment status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raypx-instance-gate-"));
  const runtime = createRuntime({ dataDir: dir });
  try {
    expect(await runtime.request("instance.status", {})).toEqual({ state: "unregistered" });
    await expect(runtime.request("roots.list", {})).rejects.toMatchObject({
      code: "INSTANCE_ENROLLMENT_REQUIRED",
    });
    await expect(runtime.request("jobs.list", {})).rejects.toMatchObject({
      code: "INSTANCE_ENROLLMENT_REQUIRED",
    });
    await expect(runtime.request("agents.projects", {})).rejects.toMatchObject({
      code: "INSTANCE_ENROLLMENT_REQUIRED",
    });
    expect(await runtime.request("runtime.info", {})).toBeTruthy();
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("enrolls with a private host token and retains the signed identity across restarts and offline operation", async () => {
  const { InstanceService } = await import("@raypx/instances/server");
  const directory = await mkdtemp(join(tmpdir(), "raypx-enrollment-http-"));
  const signer = createInstanceSigner("headless-fixture");
  const instances = new Map<string, InstanceBinding>(),
    enrollments = new Map<string, EnrollmentRecord>();
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const input = (
        (await request.json()) as {
          json: import("@raypx/instances").EnrollmentBegin & {
            id: string;
            token: string;
            timestamp: number;
            proof: string;
            instanceId: string;
          };
        }
      ).json;
      const operation = new URL(request.url).pathname.split("/").at(-1);
      const value =
        operation === "begin"
          ? await service.begin(input)
          : operation === "poll"
            ? await service.poll(input.id, input.token)
            : await service.check(input);
      return Response.json({ json: value });
    },
  });
  const service = new InstanceService({
    origin: api.url.origin,
    issuerKey: signer.publicKey,
    digest: instanceDigest,
    verify: verifyProof,
    issue: (binding) => signer.issue(binding),
    repository: {
      transaction: async (_key, run) =>
        run({
          enrollment: async (id) => enrollments.get(id),
          saveEnrollment: async (value) => {
            enrollments.set(value.id, value);
          },
          instance: async (id) => instances.get(id),
          saveInstance: async (value) => {
            instances.set(value.instanceId, value);
          },
        }),
      findCode: async (hash) => [...enrollments.values()].find((value) => value.codeHash === hash),
      list: async (owner) => [...instances.values()].filter((value) => value.accountId === owner),
    },
  });
  let storage = new ProfileStorage(directory);
  const phases: string[] = [];
  const runtime = new InstanceRuntime(directory, {
    keys: instanceKeys(storage.database),
    onProgress: (phase) => phases.push(phase),
  });
  try {
    const pending = await runtime.begin(api.url.origin);
    if (pending.registered) throw new Error("Expected pending enrollment");
    expect(pending).not.toHaveProperty("token");
    expect(pending).not.toHaveProperty("privateKey");
    expect(await runtime.poll()).toEqual({ status: "pending" });
    await service.approve("owner", pending.code);
    expect(await runtime.poll()).toEqual({ status: "approved" });
    expect(phases).toEqual([
      "starting",
      "key-read",
      "key-write",
      "key-ready",
      "request",
      "approval",
      "registered",
    ]);
    storage.close();
    storage = new ProfileStorage(directory);
    const restarted = new InstanceRuntime(directory, { keys: instanceKeys(storage.database) });
    await expect(restarted.assert()).resolves.toBeUndefined();
    const status = await restarted.status();
    expect(status.binding?.accountId).toBe("owner");
    await service.revoke("owner", status.binding!.instanceId);
    expect((await restarted.refresh()).state).toBe("revoked");
    await expect(restarted.assert()).rejects.toMatchObject({ code: "INSTANCE_REVOKED" });
    await api.stop(true);
    // Losing the network does not erase the last successful revocation.
    await expect(restarted.refresh()).rejects.toThrow(/./);
    expect((await restarted.status()).state).toBe("revoked");
  } finally {
    await api.stop(true);
    storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("persists a signed revocation and drains a running command before releasing the profile", async () => {
  const { mkdir, readFile } = await import("node:fs/promises");
  const { profilePath } = await import("../../../src/runtime/state/index.js");
  const dataDir = await mkdtemp(join(tmpdir(), "raypx-revocation-"));
  const directory = profilePath({ dataDir });
  await mkdir(directory, { recursive: true });
  const key = createInstanceKey(),
    signer = createInstanceSigner("revocation-fixture");
  const id = crypto.randomUUID();
  let revoked = false,
    delayNext = false;
  let captured!: () => void, releaseStale!: () => void;
  const arrived = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(): Promise<Response> {
      const receipt = signer.issue({
        ...binding,
        status: revoked ? "revoked" : "registered",
        revision: revoked ? 2 : 1,
      });
      if (delayNext) {
        delayNext = false;
        captured();
        await release;
      }
      return Response.json({ json: receipt });
    },
  });
  const binding: InstanceBinding = {
    version: 1 as const,
    instanceId: id,
    publicKey: key.publicKey,
    name: "Linux fixture",
    platform: "linux",
    appVersion: "0.1.0",
    accountId: "owner",
    origin: api.url.origin,
    revision: 1,
    status: "registered" as const,
    issuedAt: new Date().toISOString(),
  };
  const storage = new ProfileStorage(directory);
  await instanceKeys(storage.database).set(id, key.privateKey);
  storage.close();
  await writeFile(join(directory, "instance.json"), JSON.stringify(signer.issue(binding)), {
    mode: 0o600,
  });
  let drained = false;
  const runtime = createRuntime({
    dataDir,
    onInstanceRevoked: async () => {
      drained = true;
    },
  });
  try {
    await runtime.request("instance.refresh", {});
    const marker = join(directory, "started");
    const work = runtime.request("tools.run", {
      id: crypto.randomUUID(),
      executable: process.execPath,
      args: [
        "-e",
        "await Bun.write(process.argv.at(-1), 'started'); setInterval(() => {}, 1000)",
        marker,
      ],
      cwd: directory,
      timeoutMs: 30_000,
    });
    await expect.poll(() => Bun.file(marker).exists()).toBe(true);
    delayNext = true;
    const stale = runtime.instances.refresh().catch((error: unknown) => error);
    await arrived;
    revoked = true;
    expect(await runtime.request("instance.refresh", {})).toMatchObject({ state: "revoked" });
    releaseStale();
    expect(await stale).toMatchObject({ code: "INSTANCE_INVALID_RECEIPT" });
    expect(await work).toMatchObject({ cancelled: true });
    expect(drained).toBe(true);
    await expect(runtime.request("roots.list", {})).rejects.toMatchObject({
      code: "INSTANCE_REVOKED",
    });
    expect(
      JSON.parse(await readFile(join(directory, "instance.json"), "utf8")).binding.status,
    ).toBe("revoked");
  } finally {
    releaseStale();
    await runtime.close();
    await api.stop(true);
    await rm(dataDir, { recursive: true, force: true });
  }
});

it("revokes the original remote session before rejecting a different instance account", async () => {
  const { createHost } = await import("../../../src/runtime/host.js");
  const directory = await mkdtemp(join(tmpdir(), "raypx-instance-account-"));
  const binding: InstanceBinding = {
    version: 1,
    instanceId: crypto.randomUUID(),
    origin: "https://original.example",
    accountId: "original-owner",
    publicKey: "synthetic-public-key".repeat(3),
    name: "Fixture",
    platform: "test",
    appVersion: "0.1.0",
    revision: 1,
    status: "registered",
    issuedAt: new Date().toISOString(),
  };
  const host = createHost({
    owner: "foreground",
    dataDir: directory,
    instanceAccess: {
      assert: async () => {},
      status: async () => ({ state: "registered", binding }),
    },
  });
  const request = vi.spyOn(host.control, "request").mockResolvedValue(true);
  try {
    await expect(
      host.request("host.session", { accountId: "another-owner", apiUrl: "https://other.example" }),
    ).rejects.toMatchObject({ code: "INSTANCE_OWNER_MISMATCH" });
    expect(request).toHaveBeenCalledExactlyOnceWith("host.session", {
      accountId: null,
      apiUrl: binding.origin,
    });
  } finally {
    request.mockRestore();
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});
