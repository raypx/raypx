import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function security(...args: string[]) {
  const child = Bun.spawn(["/usr/bin/security", ...args], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 15_000,
  });
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0) throw new Error(`Test Keychain operation failed: ${args[0]}`);
  return output;
}

async function command(env: NodeJS.ProcessEnv) {
  const args = process.argv.slice(2);
  if (!args.length) throw new Error("An acceptance command is required");
  const child = Bun.spawn(args, { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

async function run() {
  if (process.platform !== "darwin") return command(process.env);
  const originalDefault = JSON.parse(
    (await security("default-keychain", "-d", "user")).trim(),
  ) as string;
  const originalSearch = (await security("list-keychains", "-d", "user"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line.trim()) as string);
  const directory = await mkdtemp(join(tmpdir(), "raypx-acceptance-keychain-"));
  const keychain = join(directory, "acceptance.keychain-db");
  const password = crypto.randomUUID() + crypto.randomUUID();
  let created = false;
  let code = 1;
  const errors: unknown[] = [];
  try {
    await security("create-keychain", "-p", password, keychain);
    created = true;
    await security("set-keychain-settings", "-lut", "3600", keychain);
    await security("unlock-keychain", "-p", password, keychain);
    await security("default-keychain", "-d", "user", "-s", keychain);
    await security("list-keychains", "-d", "user", "-s", keychain);
    // The consuming executable creates its own credential with normal production ACLs.
    // Remove the entire owned Keychain later; a separate Bun process cannot edit its ACL.
    code = await command({ ...process.env, RAYPX_TEST_KEYCHAIN: keychain });
  } catch (error) {
    errors.push(error);
  }
  for (const args of [
    ["default-keychain", "-d", "user", "-s", originalDefault],
    ["list-keychains", "-d", "user", "-s", ...originalSearch],
    ...(created ? [["delete-keychain", keychain]] : []),
  ]) {
    try {
      await security(...args);
    } catch (error) {
      errors.push(error);
    }
  }
  await rm(directory, { recursive: true, force: true });
  if (errors.length) throw new AggregateError(errors, "Test Keychain acceptance failed");
  return code;
}

process.exitCode = await run();
