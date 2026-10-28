import assert from "node:assert/strict";
import { resolve } from "node:path";

type Run = (binary: string, args: string[]) => Promise<{ code: number; output: string }>;
type Options = { platform?: NodeJS.Platform; run?: Run };
const run: Run = async (binary, args) => {
  const child = Bun.spawn([binary, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });
  const deadline = setTimeout(() => child.kill(), 30_000);
  try {
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, output };
  } finally {
    clearTimeout(deadline);
  }
};

async function command(action: "status" | "stop", directory: string, options: Options) {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "win32") return;
  const binary = resolve(
    import.meta.dirname,
    "../../../../cli/dist",
    platform === "win32" ? "raypx.exe" : "raypx",
  );
  return (options.run ?? run)(binary, [
    "daemon",
    action,
    "--profile",
    "native-smoke",
    "--data-dir",
    directory,
    "--json",
  ]);
}

export async function assertSmokeOwnerRunning(directory: string, options: Options = {}) {
  const result = await command("status", directory, options);
  if (!result) return;
  assert.equal(result.code, 0);
  assert.equal(
    JSON.parse(result.output).running,
    true,
    "GUI Quit terminated its independent execution owner",
  );
}

export async function stopSmokeOwner(directory: string, options: Options = {}) {
  const result = await command("stop", directory, options);
  return !result || result.code === 0;
}
