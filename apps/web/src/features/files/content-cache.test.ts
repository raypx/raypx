import { expect, it, vi } from "vite-plus/test";
import { createFileContentCache } from "./content-cache";
it("shares immutable-version bytes and revokes them on account exit", async () => {
  const cache = createFileContentCache();
  const revoke = vi.fn();
  const load = vi.fn(async () => ({
    content: { kind: "image" as const, src: "blob:private" },
    revoke,
  }));
  const a = cache.acquire("a", "version-1", load);
  const b = cache.acquire("a", "version-1", load);
  await Promise.all([a.promise, b.promise]);
  expect(load).toHaveBeenCalledTimes(1);
  a.release();
  b.release();
  const again = cache.acquire("a", "version-1", load);
  await again.promise;
  expect(load).toHaveBeenCalledTimes(1);
  cache.disposeAccount("a");
  expect(revoke).toHaveBeenCalledTimes(1);
  again.release();
});
it("aborts orphaned previews and rejects late bytes after switching accounts", async () => {
  const cache = createFileContentCache();
  let finish!: (result: { content: { kind: "file" }; revoke: () => void }) => void;
  const revoke = vi.fn();
  let signal!: AbortSignal;
  const pending = cache.acquire("a", "version", (requestSignal) => {
    signal = requestSignal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const failure = expect(pending.promise).rejects.toMatchObject({ name: "AbortError" });
  cache.disposeAccount("a");
  expect(signal.aborted).toBe(true);
  finish({ content: { kind: "file" }, revoke });
  await failure;
  expect(revoke).toHaveBeenCalledOnce();
  pending.release();
});
