import {
  MAX_COMPUTER_DIRECTORY_ENTRIES,
  MAX_COMPUTER_FILE_BYTES,
  type Computer,
  type ComputerDirectory,
  type ComputerFile,
  type SpaceComputer,
} from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  ComputerError as ProviderError,
  workspacePath,
  type ComputerProvider,
  type ComputerRef,
} from "@raypx/providers/computer";
export {
  createComputerScreensService,
  ComputerScreenError,
  COMPUTER_SCREEN_CONTROL_TTL_MS,
} from "./screens.js";
export type {
  ComputerScreenRepository,
  ComputerScreensService,
  ComputerScreenStreamOptions,
  ComputerScreenReleaseReason,
} from "./screens.js";
export class ComputerOperationError extends Error {
  constructor(readonly code: "COMPUTER_BUSY" | "COMPUTER_LIMIT") {
    super(code);
  }
}
export class ComputerFilesError extends Error {
  constructor(readonly code: "FILE_NOT_FOUND" | "FILE_PATH_REFUSED" | "FILE_LIMIT") {
    super(code);
  }
}
export interface ComputersRepository {
  get(this: void, scope: SpaceScope): Promise<Computer | null>;
  claim(
    this: void,
    scope: SpaceScope,
    operation: "start" | "stop",
    provider: Computer["provider"],
  ): Promise<Computer>;
  complete(
    this: void,
    scope: SpaceScope,
    claim: Computer,
    result: Pick<Computer, "state" | "homeRevision" | "failureCode">,
  ): Promise<Computer>;
}
export interface ComputersService {
  get(this: void, scope: SpaceScope): Promise<SpaceComputer>;
  start(this: void, scope: SpaceScope): Promise<SpaceComputer>;
  stop(this: void, scope: SpaceScope): Promise<SpaceComputer>;
  listDirectory(
    this: void,
    scope: SpaceScope,
    path: string,
    limit: number,
  ): Promise<ComputerDirectory>;
  readFile(this: void, scope: SpaceScope, path: string, maxBytes: number): Promise<ComputerFile>;
}
type FilesState = Exclude<ComputerDirectory, { status: "available" }>;
function fileFailure(error: unknown): FilesState {
  if (error instanceof ComputerFilesError) throw error;
  if (error instanceof ProviderError) {
    if (error.code === "NOT_RUNNING") return { status: "not-running", state: null };
    if (error.code === "NOT_FOUND") throw new ComputerFilesError("FILE_NOT_FOUND");
    if (error.code === "INVALID_INPUT") throw new ComputerFilesError("FILE_PATH_REFUSED");
    if (error.code === "LIMIT_EXCEEDED") throw new ComputerFilesError("FILE_LIMIT");
  }
  return { status: "unavailable", code: "COMPUTER_UNAVAILABLE" };
}
function contentType(bytes: Uint8Array, truncated: boolean): "text" | "binary" {
  if (bytes.some((byte) => byte === 127 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)))
    return "binary";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: truncated });
    return "text";
  } catch {
    return "binary";
  }
}
function fileBudget(value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new ComputerFilesError("FILE_LIMIT");
}
export function createComputersService(
  repository: ComputersRepository,
  provider: ComputerProvider | null,
  kind: Computer["provider"] = "sandbox",
): ComputersService {
  async function get(scope: SpaceScope): Promise<SpaceComputer> {
    if (!provider) return { status: "not-configured" };
    return { status: "available", computer: await repository.get(scope) };
  }
  async function fileAccess(
    scope: SpaceScope,
  ): Promise<FilesState | { status: "ready"; ref: ComputerRef }> {
    if (!provider) return { status: "not-configured" };
    const computer = await repository.get(scope);
    if (!computer || computer.state !== "running" || computer.leaseOwner)
      return { status: "not-running", state: computer?.state ?? null };
    return { status: "ready", ref: { id: computer.id, generation: computer.generation } };
  }
  async function lifecycle(scope: SpaceScope, operation: "start" | "stop"): Promise<SpaceComputer> {
    if (!provider) return { status: "not-configured" };
    const existing = await repository.get(scope);
    if (operation === "stop" && (!existing || existing.state === "stopped"))
      return { status: "available", computer: existing };
    if (operation === "start" && existing?.state === "running" && !existing.leaseOwner)
      return { status: "available", computer: existing };
    const claim = await repository.claim(scope, operation, kind);
    const targetState = operation === "start" ? "running" : "stopped";
    if (!claim.leaseOwner && claim.state === targetState)
      return { status: "available", computer: claim };
    const ref = { id: claim.id, generation: claim.generation };
    let result: Pick<Computer, "state" | "homeRevision" | "failureCode">;
    try {
      const computer =
        operation === "start" ? await provider.provision(ref) : await provider.stop(ref);
      result = { state: computer.state, homeRevision: computer.homeRevision, failureCode: null };
    } catch (error) {
      result = {
        state: "failed",
        homeRevision: claim.homeRevision,
        failureCode:
          error instanceof ProviderError && error.code === "RESTORE_FAILED"
            ? "RESTORE_FAILED"
            : "PROVIDER_UNAVAILABLE",
      };
    }
    return { status: "available", computer: await repository.complete(scope, claim, result) };
  }
  return {
    get,
    start: (scope) => lifecycle(scope, "start"),
    stop: (scope) => lifecycle(scope, "stop"),
    async listDirectory(scope, path, limit) {
      const access = await fileAccess(scope);
      if (access.status !== "ready") return access;
      try {
        const clean = workspacePath(path);
        fileBudget(limit, MAX_COMPUTER_DIRECTORY_ENTRIES);
        const result = await provider!.list(access.ref, clean, limit);
        return {
          status: "available",
          entries: result.entries.slice(0, limit),
          truncated: result.truncated || result.entries.length > limit,
        };
      } catch (error) {
        return fileFailure(error);
      }
    },
    async readFile(scope, path, maxBytes) {
      const access = await fileAccess(scope);
      if (access.status !== "ready") return access;
      if (!provider!.readFile) return { status: "unavailable", code: "FILES_UNAVAILABLE" };
      try {
        const clean = workspacePath(path);
        if (!clean) throw new ProviderError("INVALID_INPUT");
        fileBudget(maxBytes, MAX_COMPUTER_FILE_BYTES);
        const result = await provider!.readFile(access.ref, clean, maxBytes);
        const bytes = Buffer.from(result.bytes, "base64");
        if (bytes.length > maxBytes) throw new ProviderError("LIMIT_EXCEEDED");
        return {
          status: "available",
          ...result,
          contentType: contentType(bytes, result.truncated),
        };
      } catch (error) {
        return fileFailure(error);
      }
    },
  };
}

export * from "./devices.js";
export {
  createDeviceConnectorRegistry,
  createDeviceComputersService,
  type DeviceConnectorRegistry,
  type DeviceConnectorPeer,
  type DeviceConnectorBroker,
} from "./device-registry.js";
