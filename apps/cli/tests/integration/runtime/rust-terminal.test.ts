import { describe, expect, it } from "vite-plus/test";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { LocalEvent } from "@raypx/contracts/local";
import { RustTerminalHost } from "../../../src/runtime/process/rust-terminal.js";
import { ProcessRuntime } from "../../../src/runtime/process/index.js";

const fixture = resolve(import.meta.dirname, "../../fixtures/process/terminal-host.ts");
const command = { executable: process.execPath, args: [], cwd: tmpdir(), timeoutMs: 1000 };

describe("Rust terminal transport", () => {
  it("publishes the replay baseline before racing live bytes and preserves the exit code", async () => {
    const events: LocalEvent[] = [];
    const host = new RustTerminalHost(process.execPath, (event) => events.push(event), [fixture]);
    try {
      await host.open(command, 80, 24);
      await expect.poll(() => events.some((event) => event.event === "terminal.exit")).toBe(true);
      expect(
        events
          .filter((event) => event.event === "terminal.output")
          .map((event) => Buffer.from(String(event.data.data), "base64").toString())
          .join(""),
      ).toBe("retained-live");
      expect(events.at(-1)?.data.exitCode).toBe(7);
      expect(host.has(String(events.at(-1)?.data.id))).toBe(false);
    } finally {
      await host.close();
    }
  });

  it("rejects an explicitly selected incompatible companion", async () => {
    const host = new RustTerminalHost(process.execPath, () => {}, [fixture, "mismatch"]);
    try {
      await expect(host.open(command, 80, 24)).rejects.toMatchObject({
        code: "TERMINAL_HOST_MISMATCH",
      });
    } finally {
      await host.close();
    }
  });

  it("rejects oversized requests before writing and keeps the transport usable", async () => {
    const host = new RustTerminalHost(process.execPath, () => {}, [fixture]);
    try {
      await expect(
        host.open({ ...command, args: ["x".repeat(256 * 1024)] }, 80, 24),
      ).rejects.toMatchObject({ code: "TOO_LARGE" });
      await expect(host.open(command, 80, 24)).resolves.toHaveProperty("id");
    } finally {
      await host.close();
    }
  });

  it("sanitizes malformed protocol output", async () => {
    const host = new RustTerminalHost(process.execPath, () => {}, [fixture, "malformed"]);
    try {
      await expect(host.open(command, 80, 24)).rejects.toMatchObject({
        code: "TERMINAL_HOST_PROTOCOL",
        message: "Invalid terminal host response",
      });
    } finally {
      await host.close();
    }
  });

  it("fails a terminal when an event sequence has a gap", async () => {
    const events: LocalEvent[] = [];
    const host = new RustTerminalHost(process.execPath, (event) => events.push(event), [
      fixture,
      "gap",
    ]);
    try {
      await host.open(command, 80, 24).catch(() => {});
      await expect
        .poll(() => events.filter((event) => event.event === "terminal.exit").length)
        .toBe(1);
      expect(events.at(-1)?.data.exitCode).toBe(1);
    } finally {
      await host.close();
    }
  });

  it("keeps companion selection lazy and never falls back from an invalid path", async () => {
    const processes = new ProcessRuntime(() => {}, "relative-host");
    try {
      const result = await processes.run({
        ...command,
        args: ["-e", "console.log('ordinary-command')"],
      });
      expect(result.output).toContain("ordinary-command");
      await expect(processes.terminal(command, 80, 24)).rejects.toMatchObject({
        code: "TERMINAL_HOST_UNAVAILABLE",
      });
    } finally {
      await processes.close();
    }
  });
});
