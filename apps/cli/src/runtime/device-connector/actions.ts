import { hostname } from "node:os";
import { z } from "zod";
import { spawnProcess } from "@raypx/runtime-node/process";
import {
  deviceConnectorCredentialSchema,
  deviceDirectoryGrantWireSchema,
  devicePairingClaimResultSchema,
  DEVICE_CONNECTOR_PATHS,
  DEVICE_CONNECTOR_VERSION,
} from "@raypx/contracts/device-connector";
import { cliLaunch } from "../process/installation.js";
import { serverOrigin } from "../daemon/remote/origin.js";
import { acquireLock } from "../state/index.js";
import { LocalError } from "../errors.js";
import { captureDeviceDirectory } from "./files.js";
import { ConnectorStorage, type ConnectorProfileOptions } from "./storage.js";

const id = z.string().min(1).max(200);
const nativeInput = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("grant_request_claim"),
    serverOrigin: z.string(),
    accountId: id,
  }),
  z.strictObject({
    action: z.literal("pair_prepare"),
    serverOrigin: z.string(),
    code: z.string().min(6).max(64),
  }),
  z.strictObject({ action: z.literal("pair_confirm"), confirmationId: z.uuid() }),
  z.strictObject({
    action: z.literal("grant_prepare"),
    serverOrigin: z.string(),
    spaceId: id,
    deviceId: id,
    path: z.string().min(1).max(4096),
  }),
  z.strictObject({ action: z.literal("grant_confirm"), confirmationId: z.uuid() }),
  z.strictObject({ action: z.literal("confirmation_cancel"), confirmationId: z.uuid() }),
]);
const metadataSchema = z.object({
  accountId: id,
  accountLabel: z.string().min(1).max(200),
  spaceId: id,
  spaceLabel: z.string().min(1).max(200),
  deviceId: id,
  deviceName: z.string().min(1).max(120),
  directory: z.string().min(1).max(4096),
});
async function request(origin: string, path: string, body: unknown, credential?: string) {
  const response = await fetch(new URL(path, origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new LocalError("CONNECTOR_AUTH_REQUIRED", "Device authorization was refused or expired");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 64 * 1024)
    throw new LocalError(
      "CONNECTOR_INVALID_RESPONSE",
      "Device authorization response is too large",
    );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function prepareDevicePairing(
  storage: ConnectorStorage,
  origin: string,
  code: string,
) {
  origin = serverOrigin(origin);
  const current = storage.read();
  if (current.credential)
    throw new LocalError("CONNECTOR_ALREADY_PAIRED", "Revoke this device before pairing again");
  if (current.binding && current.binding.serverOrigin !== origin)
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Use a separate profile for this server");
  const platform =
    process.platform === "darwin" || process.platform === "linux" || process.platform === "win32"
      ? process.platform
      : "unknown";
  const claim = devicePairingClaimResultSchema.parse(
    await request(origin, DEVICE_CONNECTOR_PATHS.claim, {
      protocolVersion: DEVICE_CONNECTOR_VERSION,
      code,
      deviceName: hostname().slice(0, 120),
      platform,
    }),
  );
  if (current.binding && current.binding.accountId !== claim.accountId)
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Use a separate profile for this account");
  const pending = storage.pending("pair", { serverOrigin: origin, ...claim });
  return {
    ...pending,
    serverOrigin: origin,
    accountId: claim.accountId,
    accountLabel: claim.accountLabel,
    spaceId: claim.spaceId,
    spaceLabel: claim.spaceLabel,
    deviceName: hostname().slice(0, 120),
  };
}
export async function confirmDevicePairing(storage: ConnectorStorage, confirmationId: string) {
  const payload = storage.consume(confirmationId, "pair");
  const origin = serverOrigin(payload.serverOrigin);
  const { serverOrigin: _origin, ...claimPayload } = payload;
  const claim = devicePairingClaimResultSchema.parse(claimPayload);
  if (Date.parse(claim.expiresAt) <= Date.now())
    throw new LocalError("CONFIRMATION_EXPIRED", "Pairing code expired");
  const credential = deviceConnectorCredentialSchema.parse(
    await request(origin, DEVICE_CONNECTOR_PATHS.confirm, {
      protocolVersion: DEVICE_CONNECTOR_VERSION,
      claimId: claim.claimId,
      claimToken: claim.claimToken,
    }),
  );
  if (credential.accountId !== claim.accountId)
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Pairing account changed");
  storage.mutate((state) => {
    if (
      state.credential ||
      (state.binding &&
        (state.binding.serverOrigin !== origin || state.binding.accountId !== credential.accountId))
    )
      throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Profile binding changed");
    state.binding = {
      serverOrigin: origin,
      accountId: credential.accountId,
      deviceId: credential.deviceId,
      deviceName: credential.deviceName,
    };
    state.credential = credential;
    state.grants = [];
    state.grantRequests = [];
    state.receipts = {};
    state.runFences = {};
    state.sequence = 0;
    state.acknowledged = 0;
    state.connectionFence = 0;
    state.outbox = [];
  });
  return { paired: true, deviceId: credential.deviceId };
}
export async function prepareDeviceGrant(
  storage: ConnectorStorage,
  origin: string,
  spaceId: string,
  deviceId: string,
  path: string,
) {
  origin = serverOrigin(origin);
  const state = storage.read();
  if (
    !state.binding ||
    !state.credential ||
    state.binding.serverOrigin !== origin ||
    state.binding.deviceId !== deviceId
  )
    throw new LocalError(
      "CONNECTOR_BINDING_MISMATCH",
      "Device does not belong to this profile and server",
    );
  const directory = captureDeviceDirectory(path);
  const metadata = metadataSchema.parse(
    await request(
      origin,
      DEVICE_CONNECTOR_PATHS.prepareGrant,
      {
        protocolVersion: DEVICE_CONNECTOR_VERSION,
        deviceId,
        spaceId,
        directory: directory.directory,
      },
      state.credential.credential,
    ),
  );
  if (
    metadata.accountId !== state.binding.accountId ||
    metadata.spaceId !== spaceId ||
    metadata.deviceId !== deviceId ||
    metadata.directory !== directory.directory
  )
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Directory confirmation target changed");
  const pending = storage.pending("grant", {
    serverOrigin: origin,
    ...metadata,
    dev: directory.dev,
    ino: directory.ino,
  });
  return { ...pending, serverOrigin: origin, ...metadata, path: directory.directory };
}
export async function confirmDeviceGrant(storage: ConnectorStorage, confirmationId: string) {
  const payload = storage.consume(confirmationId, "grant");
  const origin = serverOrigin(payload.serverOrigin);
  const metadata = metadataSchema.parse(payload);
  const directory = captureDeviceDirectory(metadata.directory);
  if (directory.dev !== payload.dev || directory.ino !== payload.ino)
    throw new LocalError("CONFIRMATION_EXPIRED", "Selected directory changed; confirm it again");
  const state = storage.read();
  if (
    !state.binding ||
    !state.credential ||
    state.binding.deviceId !== metadata.deviceId ||
    state.binding.accountId !== metadata.accountId ||
    state.binding.serverOrigin !== origin
  )
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Device binding changed");
  const grant = deviceDirectoryGrantWireSchema.parse(
    await request(
      origin,
      DEVICE_CONNECTOR_PATHS.grant,
      {
        protocolVersion: DEVICE_CONNECTOR_VERSION,
        deviceId: metadata.deviceId,
        spaceId: metadata.spaceId,
        directory: directory.directory,
      },
      state.credential.credential,
    ),
  );
  if (
    grant.deviceId !== metadata.deviceId ||
    grant.spaceId !== metadata.spaceId ||
    grant.directory !== directory.directory
  )
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Directory grant changed");
  storage.mutate((stored) => {
    stored.grants = stored.grants.filter((local) => local.grant.id !== grant.id);
    stored.grants.push({ grant, dev: directory.dev, ino: directory.ino });
  });
  return { granted: true, deviceId: grant.deviceId, grantId: grant.id };
}
export function deviceConnectorStatus(storage: ConnectorStorage) {
  const state = storage.read();
  const running = Boolean(
    state.daemon && state.daemon.heartbeatAt > Date.now() - 5000 && !state.daemon.stopRequested,
  );
  return {
    paired: Boolean(state.credential),
    running,
    device: state.binding,
    grants: state.grants.map((local) => local.grant),
  };
}
export async function startDeviceConnector(options: ConnectorProfileOptions) {
  const storage = new ConnectorStorage(options);
  if (!storage.read().credential)
    throw new LocalError("CONNECTOR_NOT_PAIRED", "Pair this device first");
  if (deviceConnectorStatus(storage).running) return { running: true };
  const release = acquireLock(storage.directory, "connector-launch");
  if (!release) throw new LocalError("CONNECTOR_BUSY", "Device connector is starting");
  try {
    const available = acquireLock(storage.directory, "connector-owner");
    if (!available) throw new LocalError("CONNECTOR_BUSY", "Wait for the device connector to stop");
    available();
    const child = spawnProcess(
      [
        ...cliLaunch(),
        "device",
        "run",
        "--profile",
        options.profile ?? "default",
        ...(options.dataDir ? ["--data-dir", options.dataDir] : []),
      ],
      {
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
        env: process.env,
      },
    );
    child.unref();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (deviceConnectorStatus(storage).running) return { running: true };
      if (child.exitCode !== null) break;
      await Bun.sleep(50);
    }
    throw new LocalError("CONNECTOR_START_FAILED", "Device connector could not start");
  } finally {
    release();
  }
}
export async function stopDeviceConnector(storage: ConnectorStorage) {
  storage.mutate((state) => {
    if (state.daemon) state.daemon.stopRequested = true;
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const release = acquireLock(storage.directory, "connector-owner");
    if (release) {
      release();
      return { stopped: true };
    }
    await Bun.sleep(50);
  }
  throw new LocalError("CONNECTOR_BUSY", "Device connector is still stopping");
}
export async function revokeDeviceConnector(storage: ConnectorStorage) {
  const state = storage.mutate((stored) => {
    const final = { binding: stored.binding, credential: stored.credential };
    stored.credential = null;
    stored.grants = [];
    stored.pending = [];
    stored.grantRequests = [];
    if (stored.daemon) stored.daemon.stopRequested = true;
    return final;
  });
  await stopDeviceConnector(storage);
  let serverRevoked = true;
  if (state.binding && state.credential) {
    try {
      await request(
        state.binding.serverOrigin,
        DEVICE_CONNECTOR_PATHS.revoke,
        { protocolVersion: DEVICE_CONNECTOR_VERSION, deviceId: state.binding.deviceId },
        state.credential.credential,
      );
    } catch {
      // Local access is already revoked; an unreachable server record needs Web revocation.
      serverRevoked = false;
    }
  }
  return { revoked: true, serverRevoked };
}
export async function revokeDeviceGrant(storage: ConnectorStorage, grantId: string) {
  const state = storage.read();
  const grant = state.grants.find((local) => local.grant.id === grantId)?.grant;
  if (!grant || !state.binding || !state.credential)
    throw new LocalError("GRANT_REVOKED", "Directory grant is unavailable");
  storage.mutate((stored) => {
    stored.grants = stored.grants.filter((local) => local.grant.id !== grantId);
    if (stored.daemon) stored.daemon.stopRequested = true;
  });
  await stopDeviceConnector(storage);
  const final = storage.read();
  if (
    !final.binding ||
    !final.credential ||
    final.binding.deviceId !== grant.deviceId ||
    final.binding.accountId !== state.binding.accountId ||
    final.binding.serverOrigin !== state.binding.serverOrigin
  )
    throw new LocalError("CONNECTOR_BINDING_MISMATCH", "Device binding changed while stopping");
  await request(
    final.binding.serverOrigin,
    DEVICE_CONNECTOR_PATHS.revokeGrant,
    {
      protocolVersion: DEVICE_CONNECTOR_VERSION,
      deviceId: grant.deviceId,
      spaceId: grant.spaceId,
      grantId,
    },
    final.credential.credential,
  );
  return { revoked: true };
}
export async function nativeDeviceAction(options: ConnectorProfileOptions, raw: unknown) {
  const input = nativeInput.parse(raw);
  const storage = new ConnectorStorage(options);
  if (input.action === "grant_request_claim") {
    const origin = serverOrigin(input.serverOrigin);
    const next = storage.mutate((state) => {
      if (
        !state.binding ||
        !state.credential ||
        state.binding.serverOrigin !== origin ||
        state.binding.accountId !== input.accountId
      )
        return null;
      state.grantRequests = state.grantRequests.filter((entry) => entry.expiresAt > Date.now());
      const pendingRequest = state.grantRequests.shift();
      if (!pendingRequest) return null;
      return {
        requestId: pendingRequest.requestId,
        spaceId: pendingRequest.spaceId,
        spaceLabel: pendingRequest.spaceLabel,
        deviceId: state.binding.deviceId,
      };
    });
    return { request: next };
  }
  if (input.action === "confirmation_cancel") {
    storage.mutate((state) => {
      state.pending = state.pending.filter((entry) => entry.id !== input.confirmationId);
    });
    return { cancelled: true };
  }
  if (input.action === "pair_prepare")
    return prepareDevicePairing(storage, input.serverOrigin, input.code);
  if (input.action === "pair_confirm") {
    const result = await confirmDevicePairing(storage, input.confirmationId);
    await startDeviceConnector(options);
    return result;
  }
  if (input.action === "grant_prepare")
    return prepareDeviceGrant(
      storage,
      input.serverOrigin,
      input.spaceId,
      input.deviceId,
      input.path,
    );
  return confirmDeviceGrant(storage, input.confirmationId);
}
