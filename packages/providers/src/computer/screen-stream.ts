import { MAX_COMPUTER_SCREEN_FPS, type ComputerScreenFrame } from "@raypx/core/computers";
import { ComputerError } from "./port.js";

async function screenPause(signal?: AbortSignal) {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 1000 / MAX_COMPUTER_SCREEN_FPS);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

/** Pull driven: retain at most the currently requested frame, never an unbounded queue. */
export async function* screenFrames(
  capture: () => Promise<ComputerScreenFrame | null>,
  signal?: AbortSignal,
): AsyncIterable<ComputerScreenFrame> {
  while (true) {
    if (signal?.aborted) return;
    try {
      const frame = await capture();
      if (!frame || signal?.aborted) return;
      yield frame;
    } catch (error) {
      if (
        error instanceof ComputerError &&
        ["NOT_RUNNING", "NOT_FOUND", "STALE_GENERATION"].includes(error.code)
      )
        return;
      throw error;
    }
    await screenPause(signal);
  }
}
