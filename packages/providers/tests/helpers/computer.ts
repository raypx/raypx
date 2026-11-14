import {
  ComputerError,
  type ComputerProvider,
  type ComputerRef,
  type ProcessEvent,
} from "../../src/computer/index.js";
import { createHash } from "node:crypto";

/** Shared offline contract. Factories own their transport; this suite never builds images. */
type TestRunner = Pick<typeof import("vitest"), "afterEach" | "describe" | "expect" | "it">;
export function computerConformance(
  name: string,
  factory: () => ComputerProvider | Promise<ComputerProvider>,
  { afterEach, describe, expect, it }: TestRunner,
) {
  describe(name, () => {
    const owned: { provider: ComputerProvider; ref: ComputerRef }[] = [];
    async function setup() {
      const provider = await factory();
      const ref = { id: crypto.randomUUID(), generation: 1 };
      await provider.provision(ref);
      owned.push({ provider, ref });
      return { provider, ref };
    }
    afterEach(async () => {
      for (const { provider, ref } of owned.splice(0)) await provider.destroy(ref);
    });
    it("reconnects, stops with a revision, restarts and destroys", async () => {
      const { provider, ref } = await setup();
      expect((await provider.provision(ref)).state).toBe("running");
      expect(await provider.describe()).toMatchObject({ files: true, home: true });
      expect(await provider.stop(ref)).toMatchObject({
        state: "stopped",
        homeRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await expect(
        provider.execute(ref, {
          executable: "true",
          argv: [],
          cwd: ".",
          environment: {},
          outputBudget: 8,
        }),
      ).rejects.toMatchObject({ code: "NOT_RUNNING" });
      expect((await provider.provision(ref)).state).toBe("running");
      expect((await provider.destroy(ref)).state).toBe("destroyed");
      expect((await provider.get(ref)).state).toBe("destroyed");
    });
    it("gates graphical sessions and streams bounded images until stop", async () => {
      const { provider, ref } = await setup();
      const description = await provider.describe();
      if (!description.screen) {
        if (provider.screen) expect((await provider.screen(ref)).available).toBe(false);
        if (provider.startScreen)
          await expect(provider.startScreen(ref)).rejects.toMatchObject({
            code: "SCREEN_UNAVAILABLE",
          });
        return;
      }
      expect(provider.screen).toBeTypeOf("function");
      expect(provider.startScreen).toBeTypeOf("function");
      expect(provider.stopScreen).toBeTypeOf("function");
      expect(provider.screenshot).toBeTypeOf("function");
      expect(provider.input).toBeTypeOf("function");
      expect(provider.streamScreen).toBeTypeOf("function");
      expect(await provider.screen!(ref)).toMatchObject({ available: true, running: false });
      expect(await provider.startScreen!(ref)).toMatchObject({
        available: true,
        running: true,
        width: 1024,
        height: 768,
      });
      const before = await provider.screenshot!(ref);
      const png = Buffer.from(before.bytes, "base64");
      expect(png.length).toBeGreaterThan(64);
      expect(png.length).toBeLessThanOrEqual(1024 * 1024);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(1024);
      expect(png.readUInt32BE(20)).toBe(768);
      await provider.input!(ref, { kind: "text", text: "screen-probe" });
      let after = await provider.screenshot!(ref);
      for (let attempt = 0; after.bytes === before.bytes && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        after = await provider.screenshot!(ref);
      }
      // Compare digests so an assertion failure cannot print a private framebuffer.
      const beforeDigest = createHash("sha256").update(before.bytes).digest("hex");
      const afterDigest = createHash("sha256").update(after.bytes).digest("hex");
      expect(afterDigest).not.toBe(beforeDigest);
      expect(after.sequence).toBeGreaterThan(before.sequence);
      const frames = provider.streamScreen!(ref)[Symbol.asyncIterator]();
      expect((await frames.next()).value).toMatchObject({
        mimeType: "image/png",
        width: 1024,
        height: 768,
      });
      await provider.stopScreen!(ref);
      expect((await frames.next()).done).toBe(true);
      expect(await provider.screen!(ref)).toMatchObject({ running: false });
      await expect(provider.screenshot!(ref)).rejects.toMatchObject({ code: "NOT_RUNNING" });
    }, 20_000);
    it("streams bytes, status, cwd and command-only environment with a combined output bound", async () => {
      const { provider, ref } = await setup();
      async function execute(
        executable: string,
        argv: string[],
        outputBudget = 128,
        environment = {},
      ) {
        const process = await provider.execute(ref, {
          executable,
          argv,
          cwd: ".",
          environment,
          outputBudget,
        });
        const events: ProcessEvent[] = [];
        for await (const event of process.events) events.push(event);
        return events;
      }
      const events = await execute("printf", ["abcdef"], 3);
      expect(
        events
          .filter((e) => e.kind !== "exit")
          .map((e) => Buffer.from(e.bytes, "base64").toString())
          .join(""),
      ).toBe("abc");
      expect(events.at(-1)).toMatchObject({ kind: "exit", truncated: true, cancelled: false });
      // The two streams are independent pipes, so their relative order is not fixed. The budget
      // is shared: four bytes arrive in total, each stream keeps its own prefix.
      const mixed = await execute("sh", ["-c", "printf abc; printf def >&2; exit 7"], 4);
      const stream = (kind: "stdout" | "stderr") =>
        mixed
          .filter((e) => e.kind === kind)
          .map((e) => ("bytes" in e ? Buffer.from(e.bytes, "base64").toString() : ""))
          .join("");
      expect("abc".startsWith(stream("stdout"))).toBe(true);
      expect("def".startsWith(stream("stderr"))).toBe(true);
      expect(stream("stdout").length + stream("stderr").length).toBe(4);
      expect(mixed.at(-1)).toEqual({ kind: "exit", status: 7, cancelled: false, truncated: true });
      expect((await execute("printf", ["\\377\\000"]))[0]).toEqual({
        kind: "stdout",
        bytes: "/wA=",
      });
      expect((await execute("false", [])).at(-1)).toMatchObject({ status: 1 });
      expect(
        (
          await execute("printenv", ["RAYPX_TEST_VALUE"], 128, { RAYPX_TEST_VALUE: "one-command" })
        )[0],
      ).toMatchObject({ kind: "stdout", bytes: Buffer.from("one-command\n").toString("base64") });
      expect((await execute("printenv", ["RAYPX_TEST_VALUE"])).at(-1)).toMatchObject({ status: 1 });
      expect((await execute("pwd", []))[0]).toMatchObject({
        kind: "stdout",
        bytes: Buffer.from("/home/computer/workspace\n").toString("base64"),
      });
      expect(await execute("printf", ["x"], 0)).toEqual([
        { kind: "exit", status: 0, cancelled: false, truncated: true },
      ]);
    });
    it("cancels a process with unread stdin and drains an exit", async () => {
      const { provider, ref } = await setup();
      const process = await provider.execute(ref, {
        executable: "sleep",
        argv: ["60"],
        cwd: ".",
        environment: {},
        stdin: "输入".repeat(2048),
        outputBudget: 16,
      });
      const events: ProcessEvent[] = [];
      const drain = (async () => {
        for await (const event of process.events) events.push(event);
      })();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await process.cancel();
      await drain;
      expect(events.at(-1)).toMatchObject({ kind: "exit", cancelled: true });
      expect((await provider.get(ref)).state).toBe("running");
    });
    it("bounds files and rejects traversal, absolute paths and symlink escapes", async () => {
      const { provider, ref } = await setup();
      const bytes = Buffer.from("persist").toString("base64");
      await provider.write(ref, "a", bytes);
      await provider.write(ref, "b", bytes);
      expect(await provider.read(ref, "a", 32)).toEqual({ bytes });
      await expect(provider.read(ref, "a", 2)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
      expect(await provider.list(ref, ".", 1)).toMatchObject({
        entries: [{ path: "a", kind: "file" }],
        truncated: true,
      });
      for (const path of ["../escape", "/etc/passwd", "a/../../escape", "bad\\path"]) {
        await expect(provider.write(ref, path, bytes)).rejects.toBeInstanceOf(ComputerError);
        await expect(provider.read(ref, path, 32)).rejects.toBeInstanceOf(ComputerError);
        await expect(provider.list(ref, path, 1)).rejects.toBeInstanceOf(ComputerError);
      }
      const process = await provider.execute(ref, {
        executable: "ln",
        argv: ["-s", "/tmp", "escape"],
        cwd: ".",
        environment: {},
        outputBudget: 128,
      });
      for await (const event of process.events)
        if (event.kind === "exit") expect(event.status).toBe(0);
      await expect(provider.write(ref, "escape/outside", bytes)).rejects.toBeInstanceOf(
        ComputerError,
      );
      await expect(provider.read(ref, "escape/outside", 32)).rejects.toBeInstanceOf(ComputerError);
      await expect(provider.list(ref, "escape", 1)).rejects.toBeInstanceOf(ComputerError);
      // Snapshots preserve link entries without following them, including across replacement.
      await provider.snapshot(ref);
      ref.generation += 1;
      await provider.provision(ref);
      await expect(provider.read(ref, "escape/outside", 32)).rejects.toBeInstanceOf(ComputerError);
    });
    it("persists home through replacement, fences every old write and preserves the last good restore", async () => {
      const { provider, ref } = await setup();
      const bytes = Buffer.from("last known good").toString("base64");
      await provider.write(ref, "saved", bytes);
      await provider.snapshot(ref);
      const archive = await provider.exportHome(ref);
      archive.entries.push({
        path: ".installed-tool",
        kind: "file",
        bytes: "dG9vbA==",
        mode: 0o755,
      });
      const { revision } = await provider.importHome(ref, archive);
      const old = { ...ref };
      ref.generation += 1;
      expect(await provider.provision(ref)).toMatchObject({
        generation: 2,
        homeRevision: revision,
      });
      expect(await provider.read(ref, "saved", 100)).toEqual({ bytes });
      expect((await provider.exportHome(ref)).entries).toContainEqual({
        path: ".installed-tool",
        kind: "file",
        bytes: "dG9vbA==",
        mode: 0o755,
      });
      for (const operation of [
        () => provider.provision(old),
        () => provider.stop(old),
        () => provider.destroy(old),
        () => provider.write(old, "saved", ""),
        () => provider.importHome(old, archive),
        () => provider.snapshot(old),
        () =>
          provider.execute(old, {
            executable: "true",
            argv: [],
            cwd: ".",
            environment: {},
            outputBudget: 1,
          }),
      ])
        await expect(operation()).rejects.toMatchObject({ code: "STALE_GENERATION" });
      await expect(
        provider.importHome(ref, {
          version: 1,
          entries: [{ path: "../escape", kind: "file", bytes, mode: 0o644 }],
        }),
      ).rejects.toMatchObject({ code: "RESTORE_FAILED" });
      expect((await provider.get(ref)).homeRevision).toBe(revision);
      expect(await provider.read(ref, "saved", 100)).toEqual({ bytes });
      expect(await provider.importHome(ref, archive)).toEqual({ revision });
      await provider.destroy(ref);
      ref.generation += 1;
      await provider.provision(ref);
      expect(await provider.read(ref, "saved", 100)).toEqual({ bytes });
    });
  });
}
