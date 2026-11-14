import {
  constants,
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  deviceConnectorClientFrameSchema,
  deviceConnectorCredentialSchema,
  deviceDirectoryGrantWireSchema,
} from "@raypx/contracts/device-connector";
import { protectProfile } from "../sqlite/permissions.js";
import { acquireLock, profilePath } from "../state/index.js";
import { LocalError } from "../errors.js";

const localGrantSchema = z.strictObject({
  grant: deviceDirectoryGrantWireSchema,
  dev: z.string(),
  ino: z.string(),
});
const receiptSchema = z.strictObject({
  hash: z.string(),
  runFence: z.number().int(),
  state: z.enum(["accepted", "done", "unknown"]),
  terminal: deviceConnectorClientFrameSchema.nullable(),
});
const pendingSchema = z.strictObject({
  id: z.uuid(),
  expiresAt: z.iso.datetime(),
  action: z.enum(["pair", "grant"]),
  payload: z.record(z.string(), z.unknown()),
});
const storeSchema = z.strictObject({
  version: z.literal(1),
  binding: z
    .strictObject({
      serverOrigin: z.string(),
      accountId: z.string(),
      deviceId: z.string(),
      deviceName: z.string(),
    })
    .nullable(),
  credential: deviceConnectorCredentialSchema.nullable(),
  grants: z.array(localGrantSchema).max(256),
  pending: z.array(pendingSchema).max(16),
  grantRequests: z
    .array(
      z.strictObject({
        requestId: z.string().min(1).max(200),
        spaceId: z.string().min(1).max(200),
        spaceLabel: z.string().min(1).max(200),
        expiresAt: z.number(),
      }),
    )
    .max(16),
  sequence: z.number().int().nonnegative(),
  acknowledged: z.number().int().nonnegative(),
  connectionFence: z.number().int().nonnegative(),
  receipts: z.record(z.string(), receiptSchema),
  runFences: z.record(z.string(), z.number().int().positive()),
  outbox: z.array(deviceConnectorClientFrameSchema).max(512),
  daemon: z
    .strictObject({
      id: z.uuid(),
      pid: z.number().int().positive(),
      heartbeatAt: z.number(),
      stopRequested: z.boolean(),
    })
    .nullable(),
});
export type ConnectorState = z.infer<typeof storeSchema>;
export type LocalDeviceGrant = z.infer<typeof localGrantSchema>;
export type ConnectorProfileOptions = { dataDir?: string; profile?: string };
export class ConnectorStorage {
  readonly directory: string;
  readonly profile: string;
  private readonly file: string;
  constructor(options: ConnectorProfileOptions = {}) {
    this.profile = profilePath(options);
    this.directory = join(this.profile, "device-connector");
    protectProfile(this.directory);
    this.file = join(this.directory, "connector.json");
  }
  read(): ConnectorState {
    try {
      const stat = lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error();
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error();
      const fd = openSync(this.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        return storeSchema.parse(JSON.parse(readFileSync(fd, "utf8")));
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new LocalError(
          "CONNECTOR_STORAGE_UNAVAILABLE",
          "Device connector storage is unavailable",
        );
      return {
        version: 1,
        binding: null,
        credential: null,
        grants: [],
        pending: [],
        grantRequests: [],
        sequence: 0,
        acknowledged: 0,
        connectionFence: 0,
        receipts: {},
        runFences: {},
        outbox: [],
        daemon: null,
      };
    }
  }
  mutate<T>(change: (state: ConnectorState) => T): T {
    // Native consent and daemon receipts can briefly contend across processes.
    const release = acquireLock(this.directory, "connector-state", 1000);
    if (!release)
      throw new LocalError("CONNECTOR_BUSY", "Another device connector operation is running");
    try {
      const state = this.read();
      const result = change(state);
      const serialized = JSON.stringify(storeSchema.parse(state));
      if (Buffer.byteLength(serialized) > 8 * 1024 * 1024)
        throw new LocalError("CONNECTOR_STORAGE_LIMIT", "Device connector journal is full");
      const temporary = join(this.directory, `connector-${crypto.randomUUID()}.tmp`);
      const fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, serialized);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        renameSync(temporary, this.file);
      } finally {
        try {
          unlinkSync(temporary);
        } catch {
          /* Already renamed. */
        }
      }
      return result;
    } finally {
      release();
    }
  }
  pending(action: "pair" | "grant", payload: Record<string, unknown>) {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    this.mutate((state) => {
      state.pending = state.pending.filter((entry) => Date.parse(entry.expiresAt) > Date.now());
      if (state.pending.length >= 16)
        throw new LocalError("CONNECTOR_BUSY", "Too many pending native confirmations");
      state.pending.push({ id, action, payload, expiresAt });
    });
    return { confirmationId: id, expiresAt };
  }
  consume(id: string, action: "pair" | "grant") {
    return this.mutate((state) => {
      const pending = state.pending.find((entry) => entry.id === id);
      if (!pending || pending.action !== action || Date.parse(pending.expiresAt) <= Date.now())
        throw new LocalError("CONFIRMATION_EXPIRED", "Native confirmation expired");
      state.pending = state.pending.filter((entry) => entry.id !== id);
      return pending.payload;
    });
  }
}
