import { temporaryRepository } from "../test-fixtures.js";
import { EventEmitter } from "node:events";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  forwardProcessSignals,
  ProcessError,
  runChildProcess,
  runCommand,
  summarizeProcessOutput,
} from "./process.js";

describe("runChildProcess", () => {
  it("preserves cwd and env while capturing output", async () => {
    const cwd = await temporaryRepository();

    const result = await runChildProcess(
      [
        process.execPath,
        "-e",
        "process.stdout.write(JSON.stringify({ cwd: process.cwd(), value: process.env.VALUE }))",
      ],
      { captureOutput: true, cwd, env: { VALUE: "expected" } },
    );

    expect(result).toMatchObject({ code: 0, signal: null, stderr: "" });
    expect(JSON.parse(result.stdout)).toEqual({ cwd: await realpath(cwd), value: "expected" });
  });

  it("reports child signals", async () => {
    const result = await runChildProcess(
      [process.execPath, "-e", "process.kill(process.pid, 'SIGTERM')"],
      { stdio: "ignore" },
    );

    expect(result.signal).toBe("SIGTERM");
  });

  it("wraps process startup failures", async () => {
    await expect(
      runChildProcess([join(tmpdir(), "missing-voidmix-command")]),
    ).rejects.toMatchObject({
      name: "ProcessError",
      exitCode: null,
      signal: null,
    });
  });
});

describe("runCommand", () => {
  it("throws a typed error with the child exit code", async () => {
    await expect(
      runCommand([process.execPath, "-e", "process.exit(7)"], { stdio: "ignore" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ProcessError>>({ exitCode: 7, signal: null }),
    );
  });

  it("includes only a compact failure tail when output is captured", async () => {
    await expect(
      runCommand(
        [
          process.execPath,
          "-e",
          "for (let i = 0; i < 100; i++) console.error('line-' + i); process.exit(7)",
        ],
        { captureOutput: true },
      ),
    ).rejects.toMatchObject({
      name: "ProcessError",
      exitCode: 7,
      message: expect.stringContaining("line-99"),
    });
  });
});

describe("summarizeProcessOutput", () => {
  it("removes terminal control sequences and keeps stderr before stdout", () => {
    const summary = summarizeProcessOutput("out", "\u001b[31merror\u001b[0m\r\nlast");

    expect(summary).toBe("error\nlast\nout");
  });
});

describe("forwardProcessSignals", () => {
  it.each(["SIGTERM", "SIGINT"])("forwards %s and removes listeners", (signal) => {
    const source = new EventEmitter() as unknown as Pick<NodeJS.Process, "off" | "on">;
    const kill = vi.fn(() => true);
    const stop = forwardProcessSignals({ exitCode: null, kill, signalCode: null }, source);

    (source as unknown as EventEmitter).emit(signal);
    expect(kill).toHaveBeenCalledWith(signal);

    stop();
    (source as unknown as EventEmitter).emit("SIGINT");
    expect(kill).toHaveBeenCalledTimes(1);
  });
});
