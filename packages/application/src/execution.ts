import { defaultClock, defaultIdGenerator } from "@voidmix/core";
import type { ExecutionOptions } from "./types.js";
export function executionContext(options: ExecutionOptions) {
  return {
    now: options.now ?? (() => defaultClock.now()),
    id: options.id ?? (() => defaultIdGenerator.next()),
  };
}
