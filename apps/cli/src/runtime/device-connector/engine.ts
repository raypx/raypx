import { createHash } from "node:crypto";
import { spawnProcess } from "@raypx/runtime-node/process";
import {
  deviceConnectorPayloadIdentity,
  deviceConnectorRequestSchema,
  type DeviceConnectorClientFrame,
  type DeviceConnectorEventData,
  type DeviceConnectorRequest,
  type DeviceDirectoryGrantWire,
} from "@raypx/contracts/device-connector";
import { LocalError } from "../errors.js";
import { DeviceFiles } from "./files.js";
import type { ConnectorStorage, LocalDeviceGrant } from "./storage.js";

type EventErrorCode = Extract<DeviceConnectorEventData, { kind: "error" }>["code"];
const terminal = (event: DeviceConnectorEventData) =>
  event.kind === "exit" || event.kind === "result" || event.kind === "error";
const hashRequest = (request: DeviceConnectorRequest) =>
  createHash("sha256").update(deviceConnectorPayloadIdentity(request)).digest("hex");
export class DeviceConnectorEngine {
  private readonly files: DeviceFiles;
  private cancellationEpoch = 0;
  private readonly cancelled = new Set<string>();
  private readonly active = new Map<
    string,
    { runId: string; runFence: number; cancel: () => Promise<void> }
  >();
  constructor(
    private readonly storage: ConnectorStorage,
    private readonly send: (frame: DeviceConnectorClientFrame) => void,
  ) {
    this.files = new DeviceFiles(storage.profile);
  }
  private emit(operationId: string, event: DeviceConnectorEventData, settle = true) {
    const sent = this.storage.mutate((state): DeviceConnectorClientFrame => {
      if (state.outbox.length >= 512)
        throw new LocalError("LIMIT_EXCEEDED", "Connector event journal is full");
      const frame: DeviceConnectorClientFrame = {
        type: "event",
        connectionFence: state.connectionFence,
        sequence: ++state.sequence,
        operationId,
        event,
      };
      state.outbox.push(frame);
      if (settle && terminal(event) && state.receipts[operationId]) {
        state.receipts[operationId].state = "done";
        state.receipts[operationId].terminal = frame;
      }
      return frame;
    });
    this.send(sent);
  }
  acknowledge(sequence: number) {
    this.storage.mutate((state) => {
      if (sequence < state.acknowledged || sequence > state.sequence)
        throw new LocalError("INVALID_INPUT", "Invalid connector acknowledgement");
      state.acknowledged = sequence;
      state.outbox = state.outbox.filter(
        (frame) => frame.type !== "event" || frame.sequence > sequence,
      );
    });
  }
  async reconnect(fence: number, cursor: number, grants: DeviceDirectoryGrantWire[]) {
    await this.cancelAll();
    this.storage.mutate((state) => {
      if (fence <= state.connectionFence || cursor < state.acknowledged || cursor > state.sequence)
        throw new LocalError("STALE_FENCE", "Connector connection was replaced");
      state.connectionFence = fence;
      state.acknowledged = cursor;
      state.outbox = state.outbox
        .filter((frame) => frame.type !== "event" || frame.sequence > cursor)
        .map((frame) => (frame.type === "event" ? { ...frame, connectionFence: fence } : frame));
      state.grants = state.grants.filter((local) =>
        grants.some(
          (grant) =>
            grant.id === local.grant.id &&
            grant.revision === local.grant.revision &&
            grant.spaceId === local.grant.spaceId &&
            grant.directory === local.grant.directory,
        ),
      );
      for (const receipt of Object.values(state.receipts))
        if (receipt.state === "accepted") receipt.state = "unknown";
    });
  }
  async updateGrants(grants: DeviceDirectoryGrantWire[]) {
    const old = this.storage.read().grants;
    this.storage.mutate((state) => {
      state.grants = state.grants.filter((local) =>
        grants.some(
          (grant) =>
            grant.id === local.grant.id &&
            grant.revision === local.grant.revision &&
            grant.spaceId === local.grant.spaceId &&
            grant.directory === local.grant.directory,
        ),
      );
    });
    if (
      old.some(
        (local) =>
          !grants.some(
            (grant) => local.grant.id === grant.id && local.grant.revision === grant.revision,
          ),
      )
    )
      await this.cancelAll();
  }
  private admit(request: DeviceConnectorRequest): {
    grant: LocalDeviceGrant;
    replay?: DeviceConnectorClientFrame;
  } {
    return this.storage.mutate((state) => {
      if (
        !state.binding ||
        !state.credential ||
        request.deviceId !== state.binding.deviceId ||
        request.accountId !== state.binding.accountId ||
        request.requesterAccountId !== state.binding.accountId
      )
        throw new LocalError("ACCESS_DENIED", "Device owner does not match the Run requester");
      if (
        request.connectionFence !== state.connectionFence ||
        Date.parse(request.expiresAt) <= Date.now()
      )
        throw new LocalError("STALE_FENCE", "Device operation lease expired");
      if (Date.parse(request.expiresAt) > Date.now() + 65_000)
        throw new LocalError("INVALID_INPUT", "Device operation lease is too long");
      const grant = state.grants.find(
        (local) =>
          local.grant.id === request.grantId &&
          local.grant.spaceId === request.spaceId &&
          local.grant.deviceId === request.deviceId &&
          local.grant.revision === request.grantRevision,
      );
      if (!grant) throw new LocalError("GRANT_REVOKED", "Directory is not granted to this Space");
      if (hashRequest(request) !== request.payloadHash)
        throw new LocalError("COMMAND_CONFLICT", "Device operation payload changed");
      const previousFence = state.runFences[request.runId] ?? 0;
      if (request.runFence < previousFence)
        throw new LocalError("STALE_FENCE", "Run attempt was replaced");
      state.runFences[request.runId] = request.runFence;
      const receipt = state.receipts[request.operationId];
      if (receipt) {
        if (receipt.hash !== request.payloadHash)
          throw new LocalError("COMMAND_CONFLICT", "Operation identity was reused");
        if (receipt.state !== "done" || !receipt.terminal)
          throw new LocalError("OUTCOME_UNKNOWN", "Accepted device operation cannot be replayed");
        return { grant, replay: receipt.terminal };
      }
      if (Object.keys(state.receipts).length >= 4096)
        throw new LocalError(
          "LIMIT_EXCEEDED",
          "Device command journal is full; reconnect through a new pairing",
        );
      state.receipts[request.operationId] = {
        hash: request.payloadHash,
        runFence: request.runFence,
        state: "accepted",
        terminal: null,
      };
      return { grant };
    });
  }
  private assertCurrent(request: DeviceConnectorRequest, epoch: number) {
    if (epoch !== this.cancellationEpoch || this.cancelled.has(request.operationId))
      throw new LocalError("CANCELLED", "Device operation was cancelled before execution");
    const state = this.storage.read();
    if (
      state.connectionFence !== request.connectionFence ||
      state.runFences[request.runId] !== request.runFence ||
      Date.parse(request.expiresAt) <= Date.now()
    )
      throw new LocalError("STALE_FENCE", "Device operation lease changed");
    if (!state.credential || !state.binding || state.binding.accountId !== request.accountId)
      throw new LocalError("ACCESS_DENIED", "Device authorization was revoked");
    if (
      !state.grants.some(
        (local) =>
          local.grant.id === request.grantId &&
          local.grant.spaceId === request.spaceId &&
          local.grant.revision === request.grantRevision,
      )
    )
      throw new LocalError("GRANT_REVOKED", "Directory grant was revoked");
  }
  async request(raw: DeviceConnectorRequest) {
    let request: DeviceConnectorRequest;
    try {
      request = deviceConnectorRequestSchema.parse(raw);
    } catch {
      return;
    }
    const epoch = this.cancellationEpoch;
    const check = () => this.assertCurrent(request, epoch);
    let admitted = false;
    try {
      const { grant, replay } = this.admit(request);
      admitted = true;
      for (const active of this.active.values())
        if (active.runId === request.runId && active.runFence < request.runFence)
          await active.cancel();
      if (replay?.type === "event") {
        this.emit(request.operationId, replay.event);
        return;
      }
      this.emit(request.operationId, { kind: "accepted" });
      const operation = request.operation;
      if (operation.kind === "execute") {
        await this.execute(request, grant, check);
        return;
      }
      if (operation.kind === "list") {
        this.emit(request.operationId, {
          kind: "result",
          value: await this.files.list(grant, operation.path, operation.limit, check),
        });
        return;
      }
      if (operation.kind === "read") {
        this.emit(request.operationId, {
          kind: "result",
          value: await this.files.read(grant, operation.path, operation.maxBytes, check),
        });
        return;
      }
      await this.files.write(grant, operation.path, operation.bytes, check);
      this.emit(request.operationId, { kind: "result", value: { written: true } });
    } catch (error) {
      const safe = new Set([
        "ACCESS_DENIED",
        "STALE_FENCE",
        "GRANT_REVOKED",
        "INVALID_INPUT",
        "LIMIT_EXCEEDED",
        "CANCELLED",
        "OUTCOME_UNKNOWN",
        "COMMAND_CONFLICT",
      ]);
      let code: EventErrorCode = "UNAVAILABLE";
      if (error instanceof LocalError && safe.has(error.code)) code = error.code as EventErrorCode;
      this.emit(request.operationId, { kind: "error", code }, admitted);
    }
  }
  private async execute(
    request: DeviceConnectorRequest,
    grant: LocalDeviceGrant,
    check: () => void,
  ) {
    if (request.operation.kind !== "execute" || !request.operation.approved)
      throw new LocalError("ACCESS_DENIED", "Each device command requires approval");
    const command = request.operation;
    const cwd = await this.files.cwd(grant, command.cwd);
    check();
    // Never inherit the connector's credentials or the user's provider environment.
    const child = spawnProcess([command.executable, ...command.argv], {
      cwd,
      detached: process.platform !== "win32",
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: grant.grant.directory,
        LANG: "C.UTF-8",
        ...command.environment,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    let cancelled = false;
    const cancel = async () => {
      cancelled = true;
      if (child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* The owned child may already have exited. */
      }
      await child.exited.catch(() => {});
    };
    this.active.set(request.operationId, {
      runId: request.runId,
      runFence: request.runFence,
      cancel,
    });
    const deadline = setTimeout(
      () => {
        void cancel();
      },
      Math.max(1, Date.parse(request.expiresAt) - Date.now()),
    );
    let used = 0;
    let truncated = false;
    const secrets = [this.storage.read().credential?.credential].filter((value): value is string =>
      Boolean(value),
    );
    const secretBuffers = secrets.map((value) => Buffer.from(value));
    const tailSize = Math.max(0, ...secretBuffers.map((value) => value.length - 1));
    const pump = async (kind: "stdout" | "stderr", stream: ReadableStream<Uint8Array>) => {
      let tail = Buffer.alloc(0);
      const publish = (bytes: Buffer) => {
        for (const secret of secretBuffers) {
          let at = bytes.indexOf(secret);
          while (at >= 0) {
            bytes.fill(42, at, at + secret.length);
            at = bytes.indexOf(secret, at + secret.length);
          }
        }
        const remaining = Math.max(0, command.outputBudget - used);
        if (bytes.length > remaining) truncated = true;
        const admitted = bytes.subarray(0, remaining);
        used += admitted.length;
        for (let offset = 0; offset < admitted.length; offset += 32 * 1024)
          this.emit(request.operationId, {
            kind,
            bytes: admitted.subarray(offset, offset + 32 * 1024).toString("base64"),
          });
      };
      for await (const chunk of stream) {
        const bytes = Buffer.concat([tail, Buffer.from(chunk)]);
        // Mask before retaining the tail so credentials split across chunks cannot escape.
        for (const secret of secretBuffers) {
          let at = bytes.indexOf(secret);
          while (at >= 0) {
            bytes.fill(42, at, at + secret.length);
            at = bytes.indexOf(secret, at + secret.length);
          }
        }
        const boundary = Math.max(0, bytes.length - tailSize);
        publish(bytes.subarray(0, boundary));
        tail = Buffer.from(bytes.subarray(boundary));
      }
      publish(tail);
    };
    try {
      const [status] = await Promise.all([
        child.exited,
        pump("stdout", child.stdout),
        pump("stderr", child.stderr),
      ]);
      this.emit(request.operationId, { kind: "exit", status, cancelled, truncated });
    } finally {
      clearTimeout(deadline);
      await cancel();
      this.active.delete(request.operationId);
    }
  }
  async cancel(operationId: string) {
    if (!this.active.has(operationId) && !Object.hasOwn(this.storage.read().receipts, operationId))
      return;
    this.cancelled.add(operationId);
    await this.active.get(operationId)?.cancel();
  }
  async cancelAll() {
    this.cancellationEpoch += 1;
    await Promise.all([...this.active.values()].map((operation) => operation.cancel()));
  }
}
