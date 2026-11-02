import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { createApiClient, type ApiClient } from "@raypx/client";
import {
  instanceOrigin,
  instanceReceiptSchema,
  enrollmentProof,
  instanceCheckProof,
  InstanceError,
  type InstanceReceipt,
  type InstanceStatus,
} from "@raypx/instances";
import {
  createInstanceKey,
  signProof,
  verifyInstanceReceipt,
  instanceDigest,
  verifyProof,
} from "@raypx/instances/crypto";
import { acquireLock } from "../state";
import manifest from "../../../package.json";
export type InstanceEnrollmentPhase =
  | "starting"
  | "key-read"
  | "key-ready"
  | "request"
  | "approval"
  | "registered";
export interface InstanceAccess {
  assert(): Promise<void>;
  status(): Promise<InstanceStatus>;
}
export interface InstanceKeyStore {
  get(id: string): Promise<string | undefined>;
  set(id: string, key: string): Promise<void>;
}
function keyStore(directory: string): InstanceKeyStore {
  const service = "pro.raypx.instance",
    name = instanceDigest(directory);
  if (process.platform === "darwin" || process.platform === "win32")
    return {
      get: async () => (await Bun.secrets.get({ service, name })) ?? undefined,
      set: async (_id, value) => {
        await Bun.secrets.set({ service, name, value, persist: "local" });
      },
    };
  const file = join(directory, "instance.key");
  return {
    get: async () => {
      try {
        const stat = await lstat(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          (stat.mode & 0o077) !== 0 ||
          stat.size > 4096
        )
          throw new InstanceError("INSTANCE_KEY_UNAVAILABLE");
        return (await readFile(file)).toString("base64");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    },
    set: async (_id, key) => {
      await writeFile(file, Buffer.from(key, "base64"), { mode: 0o600, flag: "wx" });
    },
  };
}
export class InstanceRuntime implements InstanceAccess {
  private pending:
    | {
        id: string;
        token: string;
        issuerKey: string;
        origin: string;
        publicKey: string;
        instanceId: string;
      }
    | undefined;
  private readonly keys: InstanceKeyStore;
  constructor(
    readonly directory: string,
    private readonly options: {
      keys?: InstanceKeyStore;
      onProgress?: (phase: InstanceEnrollmentPhase) => void;
      client?: (origin: string) => ApiClient;
    } = {},
  ) {
    this.keys = options.keys ?? keyStore(directory);
  }
  private progress(phase: InstanceEnrollmentPhase) {
    try {
      this.options.onProgress?.(phase);
    } catch {
      /* Observability cannot change enrollment. */
    }
  }
  private async read(): Promise<InstanceReceipt | undefined> {
    try {
      const file = join(this.directory, "instance.json");
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384)
        throw new InstanceError("INSTANCE_INVALID_RECEIPT");
      const parsed = instanceReceiptSchema.parse(JSON.parse(await readFile(file, "utf8")));
      return verifyInstanceReceipt(parsed, parsed.issuerKey);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
  private async save(receipt: InstanceReceipt) {
    const release = acquireLock(this.directory, "instance-identity");
    if (!release) throw new InstanceError("INSTANCE_ENROLLMENT_BUSY");
    try {
      const old = await this.read();
      if (old) {
        if (
          old.binding.accountId !== receipt.binding.accountId ||
          old.binding.origin !== receipt.binding.origin ||
          old.binding.instanceId !== receipt.binding.instanceId ||
          old.binding.publicKey !== receipt.binding.publicKey ||
          old.issuerKey !== receipt.issuerKey
        )
          throw new InstanceError("INSTANCE_OWNER_MISMATCH");
        if (
          receipt.binding.revision < old.binding.revision ||
          (old.binding.status === "revoked" && receipt.binding.status !== "revoked")
        )
          throw new InstanceError("INSTANCE_INVALID_RECEIPT");
      }
      const temporary = join(this.directory, "instance-" + crypto.randomUUID() + ".tmp");
      await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
      await rename(temporary, join(this.directory, "instance.json"));
    } finally {
      release();
    }
  }
  async status(): Promise<InstanceStatus> {
    try {
      const receipt = await this.read();
      if (!receipt) return { state: "unregistered" };
      const key = await this.keys.get(receipt.binding.instanceId);
      if (
        !key ||
        !verifyProof(
          receipt.binding.publicKey,
          "raypx-instance-key-check",
          signProof(key, "raypx-instance-key-check"),
        )
      )
        return { state: "unavailable" };
      return { state: receipt.binding.status, binding: receipt.binding };
    } catch {
      return { state: "unavailable" };
    }
  }
  async assert() {
    const status = await this.status();
    if (status.state !== "registered")
      throw new InstanceError(
        status.state === "revoked"
          ? "INSTANCE_REVOKED"
          : status.state === "unavailable"
            ? "INSTANCE_KEY_UNAVAILABLE"
            : "INSTANCE_ENROLLMENT_REQUIRED",
      );
  }
  private client(origin: string) {
    return this.options.client?.(origin) ?? createApiClient({ baseUrl: origin });
  }
  async begin(rawOrigin: string) {
    this.progress("starting");
    const origin = instanceOrigin(rawOrigin);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const release = acquireLock(this.directory, "instance-enrollment");
    if (!release) throw new InstanceError("INSTANCE_ENROLLMENT_BUSY");
    try {
      return await this.beginLocked(origin);
    } finally {
      release();
    }
  }
  private async beginLocked(rawOrigin: string) {
    const origin = instanceOrigin(rawOrigin),
      old = await this.read();
    if (old) {
      if (old.binding.origin !== origin) throw new InstanceError("INSTANCE_OWNER_MISMATCH");
      await this.assert();
      return { registered: true as const };
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const identityFile = join(this.directory, "instance-id");
    let instanceId: string;
    try {
      const stat = await lstat(identityFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100 || stat.mode & 0o077)
        throw new InstanceError("INSTANCE_INVALID_ID");
      instanceId = (await readFile(identityFile, "utf8")).trim();
      if (!/^[a-f0-9-]{36}$/.test(instanceId)) throw new InstanceError("INSTANCE_INVALID_ID");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      instanceId = crypto.randomUUID();
      await writeFile(identityFile, instanceId, { mode: 0o600, flag: "wx" });
    }
    this.progress("key-read");
    let privateKey = await this.keys.get(instanceId);
    if (!privateKey) {
      const pair = createInstanceKey();
      await this.keys.set(instanceId, pair.privateKey);
      privateKey = pair.privateKey;
    }
    const { createPublicKey, createPrivateKey } = await import("node:crypto");
    const publicKey = createPublicKey(
      createPrivateKey({ key: Buffer.from(privateKey, "base64"), type: "pkcs8", format: "der" }),
    )
      .export({ type: "spki", format: "der" })
      .toString("base64");
    this.progress("key-ready");
    const identity = {
      instanceId,
      publicKey,
      name: hostname().slice(0, 120) || "Raypx",
      platform: process.platform,
      appVersion: manifest.version,
    };
    this.progress("request");
    const result = await this.client(origin).instances.begin(
      {
        ...identity,
        proof: signProof(privateKey, enrollmentProof(origin, identity)),
      },
      { signal: AbortSignal.timeout(10_000) },
    );
    this.progress("approval");
    this.pending = {
      id: result.id,
      token: result.token,
      issuerKey: result.issuerKey,
      origin,
      publicKey,
      instanceId,
    };
    return { registered: false as const, code: result.code, expiresAt: result.expiresAt };
  }
  async poll() {
    const pending = this.pending;
    if (!pending) throw new InstanceError("INSTANCE_ENROLLMENT_REQUIRED");
    const result = await this.client(pending.origin).instances.poll(
      {
        id: pending.id,
        token: pending.token,
      },
      { signal: AbortSignal.timeout(10_000) },
    );
    if (result.status === "approved") {
      const receipt = verifyInstanceReceipt(result.receipt, pending.issuerKey);
      if (
        receipt.binding.origin !== pending.origin ||
        receipt.binding.publicKey !== pending.publicKey ||
        receipt.binding.instanceId !== pending.instanceId ||
        receipt.binding.status !== "registered"
      )
        throw new InstanceError("INSTANCE_INVALID_RECEIPT");
      await this.save(receipt);
      this.pending = undefined;
      this.progress("registered");
    }
    return { status: result.status };
  }
  async refresh() {
    const old = await this.read();
    if (!old) return this.status();
    const key = await this.keys.get(old.binding.instanceId);
    if (!key) throw new InstanceError("INSTANCE_KEY_UNAVAILABLE");
    const timestamp = Date.now();
    const receipt = verifyInstanceReceipt(
      await this.client(old.binding.origin).instances.check(
        {
          instanceId: old.binding.instanceId,
          timestamp,
          proof: signProof(
            key,
            instanceCheckProof(old.binding.origin, old.binding.instanceId, timestamp),
          ),
        },
        { signal: AbortSignal.timeout(10_000) },
      ),
      old.issuerKey,
    );
    if (
      receipt.binding.instanceId !== old.binding.instanceId ||
      receipt.binding.accountId !== old.binding.accountId ||
      receipt.binding.publicKey !== old.binding.publicKey ||
      receipt.binding.origin !== old.binding.origin ||
      receipt.binding.revision < old.binding.revision
    )
      throw new InstanceError("INSTANCE_INVALID_RECEIPT");
    await this.save(receipt);
    return this.status();
  }
}
