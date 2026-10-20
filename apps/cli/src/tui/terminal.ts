import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { LocalError } from "../runtime/errors";

export interface TuiTerminal {
  write(text: string): void;
  read(prompt: string, signal?: AbortSignal): Promise<string | null>;
  close(): void;
}

export interface TuiInput extends Readable {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
}

export interface TuiOutput extends Writable {
  isTTY?: boolean;
  columns?: number;
}

export interface TerminalOptions {
  input?: TuiInput;
  output?: TuiOutput;
  onInterrupt?: () => void;
}

/** A line-oriented terminal: no alternate screen, hidden cursor or external renderer. */
export function createTerminal(options: TerminalOptions = {}): TuiTerminal {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (!input.isTTY || !output.isTTY) {
    throw new LocalError(
      "INTERACTIVE_REQUIRED",
      "Interactive mode requires a terminal input and output",
    );
  }

  // A pristine stream has readableFlowing=null while isPaused() is false. Only
  // resume an input that was already flowing, otherwise stdin can keep us alive.
  const wasFlowing = input.readableFlowing === true;
  const wasRaw = input.isRaw ?? false;
  const lines: string[] = [];
  let closed = false;
  let waiting: ((line: string | null) => void) | undefined;
  const readline = createInterface({ input, output, terminal: true, crlfDelay: Infinity });

  function close() {
    lines.length = 0;
    if (!closed) readline.close();
  }

  readline.on("line", (line: string) => {
    if (waiting) {
      const resolve = waiting;
      waiting = undefined;
      resolve(line);
    } else {
      lines.push(line);
    }
  });
  readline.on("SIGINT", () => {
    close();
    options.onInterrupt?.();
  });
  readline.once("close", () => {
    closed = true;
    if (input.setRawMode && input.isRaw !== wasRaw) input.setRawMode(wasRaw);
    if (wasFlowing) input.resume();
    else input.pause();
    const resolve = waiting;
    waiting = undefined;
    resolve?.(null);
  });

  return {
    write(text) {
      output.write(text);
    },
    async read(prompt, signal) {
      if (signal?.aborted) return null;
      if (waiting) {
        throw new LocalError("INTERACTIVE_BUSY", "Only one interactive prompt can be active");
      }
      const line = lines.shift();
      if (line !== undefined) {
        output.write(prompt);
        return line;
      }
      if (closed) return null;
      return new Promise<string | null>((resolve) => {
        const onAbort = () => finish(null);
        const finish = (value: string | null) => {
          signal?.removeEventListener("abort", onAbort);
          if (waiting === finish) waiting = undefined;
          resolve(value);
        };
        waiting = finish;
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) {
          finish(null);
          return;
        }
        readline.setPrompt(prompt);
        readline.prompt();
      });
    },
    close,
  };
}
