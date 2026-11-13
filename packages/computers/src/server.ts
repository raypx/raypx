import type { Computer, SpaceComputer } from "@raypx/core/computers";
import type { SpaceScope } from "@raypx/spaces/server";
import { ComputerError as ProviderError, type ComputerProvider } from "@raypx/providers/computer";
export class ComputerOperationError extends Error {
  constructor(readonly code: "COMPUTER_BUSY" | "COMPUTER_LIMIT") {
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
  async function lifecycle(scope: SpaceScope, operation: "start" | "stop"): Promise<SpaceComputer> {
    if (!provider) return { status: "not-configured" };
    const existing = await repository.get(scope);
    if (operation === "stop" && (!existing || existing.state === "stopped"))
      return { status: "available", computer: existing };
    if (operation === "start" && existing?.state === "running" && !existing.leaseOwner)
      return { status: "available", computer: existing };
    const claim = await repository.claim(scope, operation, kind);
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
  };
}
