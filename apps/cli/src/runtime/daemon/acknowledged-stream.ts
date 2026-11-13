import { AcknowledgedStream as SharedStream, type RelayScheduler } from "@raypx/client/relay";
import { LocalError } from "../errors.js";
export type { StreamCursor } from "@raypx/client/relay";

export class AcknowledgedStream extends SharedStream {
  constructor(scheduler?: Pick<RelayScheduler, "timeout">, timeoutMs = 10_000) {
    super(scheduler, timeoutMs, (code, message) => new LocalError(code, message));
  }
}
