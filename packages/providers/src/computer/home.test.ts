import { expect, it } from "vitest";
import { validateHome, workspacePath, createMemoryComputerProvider } from "./index.js";
it("rejects malformed archives atomically, including duplicate and non-directory parents", async () => {
  const ref = { id: crypto.randomUUID(), generation: 1 };
  const provider = createMemoryComputerProvider();
  await provider.provision(ref);
  await provider.write(ref, "good", "Z29vZA==");
  const good = await provider.snapshot(ref);
  const file = { path: "a", kind: "file" as const, bytes: "YQ==", mode: 0o644 };
  for (const entries of [
    [file, file],
    [file, { ...file, path: "a/b" }],
    [{ ...file, path: "/escape" }],
    [{ ...file, bytes: "bad" }],
  ]) {
    await expect(provider.importHome(ref, { version: 1, entries })).rejects.toMatchObject({
      code: "RESTORE_FAILED",
    });
    expect((await provider.get(ref)).homeRevision).toBe(good.revision);
    expect(await provider.read(ref, "good", 8)).toEqual({ bytes: "Z29vZA==" });
  }
});
it("canonicalizes revision ordering without mutating the supplied archive", async () => {
  const workspace = { path: "workspace", kind: "directory" as const, mode: 0o755 };
  const a = { path: "a", kind: "directory" as const, mode: 0o755 };
  const b = { ...a, path: "b" };
  expect((await validateHome({ version: 1, entries: [workspace, a, b] })).revision).toBe(
    (await validateHome({ version: 1, entries: [b, workspace, a] })).revision,
  );
  const composed = { ...a, path: "é" };
  const decomposed = { ...a, path: "e\u0301" };
  expect(
    (await validateHome({ version: 1, entries: [workspace, composed, decomposed] })).revision,
  ).toBe((await validateHome({ version: 1, entries: [decomposed, workspace, composed] })).revision);
  for (const path of ["../x", "a/../b", "/x", "a\\b", "a\0b"])
    expect(() => workspacePath(path)).toThrow("INVALID_INPUT");
});
it("prevents a delayed old command from writing into a replacement home", async () => {
  const provider = createMemoryComputerProvider();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await provider.provision(ref);
  const delayed = await provider.execute(ref, {
    executable: "ln",
    argv: ["-s", "/tmp", "old-link"],
    cwd: ".",
    environment: {},
    outputBudget: 100,
  });
  const replacement = { ...ref, generation: 2 };
  await provider.provision(replacement);
  const events = [];
  for await (const event of delayed.events) events.push(event);
  expect(events.at(-1)).toMatchObject({ kind: "exit", cancelled: true });
  expect(await provider.list(replacement, ".", 100)).toEqual({ entries: [], truncated: false });
});
