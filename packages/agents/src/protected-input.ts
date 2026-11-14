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

/** Handles exact raw and JSON-escaped echoes, including nested JSON tool content. */
export function scrubProtectedOutput(output: string, value: string): string {
  const variants = new Set([value]);
  let encoded = value;
  for (let depth = 0; depth < 5; depth++) {
    encoded = JSON.stringify(encoded).slice(1, -1);
    variants.add(encoded);
  }
  let result = output;
  for (const secret of [...variants].sort((a, b) => b.length - a.length))
    result = result.replaceAll(secret, "[protected]");
  return result;
}
