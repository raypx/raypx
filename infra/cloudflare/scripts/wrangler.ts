import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const command = process.argv[2];
if (!["dev", "plan", "plan:worker", "deploy"].includes(command ?? ""))
  throw new Error("Expected dev, plan, plan:worker or deploy");

// Only public release metadata enters Docker build arguments. Runtime secrets
// are Worker secret bindings and never appear in generated config or the image.
const release =
  process.env.VITE_APP_RELEASE ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
if (!/^[\w.-]{1,200}$/.test(release)) throw new Error("Invalid public release identifier");
const config = await Bun.file(join(workspace, "wrangler.json")).json();
config.containers[0].image_vars = { VITE_APP_RELEASE: release };
config.build = {
  command: "bun run raypx-dev tasks build --filter relay-cloudflare",
  cwd: root,
  watch_dir: join(workspace, "src"),
};

// Keep the file beside wrangler.json so relative image paths and .dev.vars keep
// their normal meaning. Remove it even when the deploy/build fails.
const generated = join(workspace, `.wrangler.${process.pid}.json`);
try {
  await Bun.write(generated, JSON.stringify(config));
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(import.meta.resolve("wrangler")),
      command === "dev" ? "dev" : "deploy",
      ...(command?.startsWith("plan") ? ["--dry-run"] : []),
      ...(command === "plan:worker" ? ["--containers-rollout=none"] : []),
      "--config",
      generated,
      ...process.argv.slice(3),
    ],
    { cwd: workspace, env: process.env, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
  );
  process.exitCode = await child.exited;
} finally {
  await Bun.file(generated).delete();
}
