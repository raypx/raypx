import { scrubProtectedValue } from "@raypx/core/protected-input";
import type { ProtectedInputAnswer, ProtectedInputRequest } from "@raypx/core/protected-input";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ExecutionRun } from "./conversations.js";
import type { PreparedComputerCall } from "./computer-tools.js";

export class ProtectedInputError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "RESOLVED" | "EXPIRED" | "UNAVAILABLE" | "INVALID_INPUT",
  ) {
    super(code);
    this.name = "ProtectedInputError";
  }
}
export interface ProtectedInputCipher {
  seal(
    binding: string,
    value: string,
  ): Promise<{ ciphertext: string; wrappedDataKey: string; keyId: string }>;
  open(
    binding: string,
    sealed: { ciphertext: string; wrappedDataKey: string; keyId: string },
  ): Promise<string>;
}
export interface ProtectedInputsService {
  cleanup(): Promise<void>;
  pending(scope: SpaceScope): Promise<ProtectedInputRequest[]>;
  answer(
    scope: SpaceScope,
    id: string,
    answer: ProtectedInputAnswer,
  ): Promise<ProtectedInputRequest>;
  wait(
    scope: SpaceScope,
    run: ExecutionRun,
    call: PreparedComputerCall,
    signal: AbortSignal,
  ): Promise<ProtectedInputRequest["state"]>;
  consume(
    scope: SpaceScope,
    run: ExecutionRun,
    call: PreparedComputerCall,
    operation: (value: string) => Promise<string>,
  ): Promise<string>;
}

/** Scrub before any durable or returned output boundary. */
export const scrubProtectedOutput = scrubProtectedValue;
