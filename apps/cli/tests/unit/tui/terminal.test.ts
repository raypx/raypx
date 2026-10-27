import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vite-plus/test";
import { createTerminal, type TuiInput, type TuiOutput } from "../../../src/tui/terminal";

function streams(
  options: {
    raw?: boolean;
    paused?: boolean;
    pristine?: boolean;
    inputTty?: boolean;
    outputTty?: boolean;
  } = {},
) {
  const rawModes: boolean[] = [];
  const input: TuiInput = Object.assign(new PassThrough(), {
    isTTY: options.inputTty ?? true,
    isRaw: options.raw ?? false,
    setRawMode(enabled: boolean) {
      rawModes.push(enabled);
      input.isRaw = enabled;
      return input;
    },
  });
  let text = "";
  const output: TuiOutput = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        text += String(chunk);
        callback();
      },
    }),
    { isTTY: options.outputTty ?? true, columns: 80 },
  );
  if (!options.pristine) {
    if (options.paused) input.pause();
    else input.resume();
  }
  return { input, output, rawModes, text: () => text };
}

describe("interactive terminal", () => {
  it.each([{ inputTty: false }, { outputTty: false }])(
    "rejects non-TTY streams before entering raw mode: %j",
    (options) => {
      const io = streams(options);
      expect(() => createTerminal(io)).toThrow(
        "Interactive mode requires a terminal input and output",
      );
      expect(io.rawModes).toEqual([]);
    },
  );

  it("buffers multiple lines instead of dropping input between prompts", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    try {
      const first = terminal.read("First: ");
      io.input.emit("data", Buffer.from("one\ntwo\n\n"));
      expect(await first).toBe("one");
      expect(await terminal.read("Second: ")).toBe("two");
      expect(await terminal.read("Empty: ")).toBe("");
      expect(io.text()).toContain("First: ");
      expect(io.text()).toContain("Second: ");
    } finally {
      terminal.close();
    }
  });

  it("resolves the pending read on EOF and allows buffered lines to be consumed", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    const pending = terminal.read("Input: ");
    io.input.emit("end");
    expect(await pending).toBeNull();
    expect(await terminal.read("After EOF: ")).toBeNull();

    const queuedIo = streams();
    const queued = createTerminal(queuedIo);
    queuedIo.input.emit("data", Buffer.from("saved\n"));
    queuedIo.input.emit("end");
    expect(await queued.read("Saved: ")).toBe("saved");
    expect(await queued.read("After EOF: ")).toBeNull();
    terminal.close();
    queued.close();
  });

  it("delegates Ctrl-C to its owner and does not exit the process", async () => {
    const io = streams();
    let interrupted = 0;
    const terminal = createTerminal({
      ...io,
      onInterrupt: () => {
        interrupted += 1;
      },
    });
    const pending = terminal.read("Input: ");
    io.input.emit("data", Buffer.from("\u0003"));
    expect(interrupted).toBe(1);
    terminal.close();
    expect(await pending).toBeNull();
  });

  it("closes on Ctrl-C even when no interrupt callback was provided", async () => {
    const io = streams({ paused: true });
    const terminal = createTerminal(io);
    const pending = terminal.read("Input: ");
    io.input.emit("data", Buffer.from("\u0003"));
    expect(await pending).toBeNull();
    expect(io.input.isRaw).toBe(false);
    expect(io.input.isPaused()).toBe(true);
    expect(await terminal.read("Closed: ")).toBeNull();
  });

  it("aborts only the current read without consuming the next prompt's input", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    const controller = new AbortController();
    const pending = terminal.read("Waiting: ", controller.signal);
    controller.abort();
    expect(await pending).toBeNull();
    const next = terminal.read("Next: ");
    io.input.emit("data", Buffer.from("menu answer\n"));
    expect(await next).toBe("menu answer");
    terminal.close();
  });

  it("does not consume buffered input when the signal was already aborted", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    io.input.emit("data", Buffer.from("buffered\n"));
    expect(await terminal.read("Aborted: ", AbortSignal.abort())).toBeNull();
    expect(await terminal.read("Next: ")).toBe("buffered");
    terminal.close();
  });

  it("removes a completed prompt's abort listener before the next read", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    const controller = new AbortController();
    const first = terminal.read("First: ", controller.signal);
    io.input.emit("data", Buffer.from("first\n"));
    expect(await first).toBe("first");
    const next = terminal.read("Next: ");
    controller.abort();
    io.input.emit("data", Buffer.from("second\n"));
    expect(await next).toBe("second");
    terminal.close();
  });

  it.each([
    { raw: false, paused: true },
    { raw: true, paused: false },
  ])("restores the previous input state after an idempotent close: %j", async (options) => {
    const io = streams(options);
    const terminal = createTerminal(io);
    const pending = terminal.read("Input: ");
    terminal.close();
    terminal.close();
    expect(await pending).toBeNull();
    expect(io.input.isRaw).toBe(options.raw);
    expect(io.input.isPaused()).toBe(options.paused);
    expect(await terminal.read("Closed: ")).toBeNull();
  });

  it("leaves an initially untouched input paused rather than starting it on close", () => {
    const io = streams({ pristine: true });
    expect(io.input.readableFlowing).toBeNull();
    expect(io.input.isPaused()).toBe(false);
    const terminal = createTerminal(io);
    terminal.close();
    expect(io.input.readableFlowing).toBe(false);
    expect(io.input.isPaused()).toBe(true);
  });

  it("discards queued input when explicitly closed", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    io.input.emit("data", Buffer.from("unused\n"));
    terminal.close();
    expect(await terminal.read("Closed: ")).toBeNull();
  });

  it("rejects overlapping prompts without replacing the pending reader", async () => {
    const io = streams();
    const terminal = createTerminal(io);
    const pending = terminal.read("First: ");
    await expect(terminal.read("Second: ")).rejects.toThrow(
      "Only one interactive prompt can be active",
    );
    io.input.emit("data", Buffer.from("answer\n"));
    expect(await pending).toBe("answer");
    terminal.close();
  });
});
