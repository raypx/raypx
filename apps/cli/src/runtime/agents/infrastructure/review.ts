import type { TaskReview } from "@raypx/core/tasks";

const limit = 48_000;

async function git(directory: string, args: string[], signal: AbortSignal, exitCodes = [0]) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  const child = Bun.spawn(["git", "--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
    cwd: directory,
    env,
    stdout: "pipe",
    stderr: "ignore",
  });
  const reader = child.stdout.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const stop = () => {
    child.kill();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Git output exceeds review limit");
      chunks.push(value);
    }
    if (!exitCodes.includes(await child.exited) || signal.aborted)
      throw new Error("Git review unavailable");
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } finally {
    child.kill();
    await reader.cancel().catch(() => {});
    await child.exited;
    signal.removeEventListener("abort", stop);
  }
}

type Snapshot = NonNullable<TaskReview["before"]>;

export async function captureProjectReview(
  directory: string,
  baseline?: string,
): Promise<Snapshot | undefined> {
  try {
    const signal = AbortSignal.timeout(2_000);
    const revision = (
      await git(directory, ["rev-parse", "--verify", "HEAD^{commit}"], signal)
    ).trim();
    if (!/^[a-f0-9]{40,64}$/.test(revision)) return undefined;
    const filters = await git(
      directory,
      ["config", "--name-only", "--get-regexp", "^filter[.].*[.](clean|smudge|process)$"],
      signal,
      [0, 1],
    );
    if (filters.trim()) return undefined;
    const [patchResult, pathsResult] = await Promise.allSettled([
      git(
        directory,
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--ignore-submodules=all",
          "--no-color",
          "--no-renames",
          "--relative",
          baseline ?? revision,
          "--",
          ".",
        ],
        signal,
      ),
      git(directory, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."], signal),
    ]);
    if (patchResult.status !== "fulfilled" || pathsResult.status !== "fulfilled") return undefined;
    const untracked = pathsResult.value.split("\0").filter(Boolean);
    if (untracked.length > 200 || untracked.some((path) => path.length > 4096)) return undefined;
    const result = { revision, patch: patchResult.value, untracked };
    return Buffer.byteLength(JSON.stringify(result)) <= 64_000 ? result : undefined;
  } catch {
    return undefined;
  }
}
