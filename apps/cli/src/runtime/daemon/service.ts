import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { connectDaemon, type ProfileOptions } from "./endpoint";
import { installStableCli, raypxHome } from "./connectors";
import { profilePath } from "../state";
import { LocalError } from "../errors";

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function serviceDefinition(options: ProfileOptions, binary: string, home = homedir()) {
  const directory = profilePath(options),
    id = createHash("sha256").update(directory).digest("hex").slice(0, 16);
  const label = `pro.raypx.host.${id}`;
  const args = [
    binary,
    "daemon",
    "run",
    "--profile",
    options.profile ?? "default",
    "--data-dir",
    dirname(dirname(directory)),
  ];
  const path = [
    join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(label)}</string><key>ProgramArguments</key><array>${args.map((value) => `<string>${xml(value)}</string>`).join("")}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string><key>RAYPX_HOME</key><string>${xml(raypxHome())}</string></dict></dict></plist>\n`;
  return { label, plist, file: join(home, "Library", "LaunchAgents", `${label}.plist`) };
}
export async function configureService(options: ProfileOptions, action: "install" | "uninstall") {
  if (process.platform !== "darwin" || !process.getuid?.())
    throw new LocalError("UNSUPPORTED_PLATFORM", "Install this service as a macOS user");
  const binary = action === "install" ? installStableCli() : join(raypxHome(), "bin", "raypx");
  const { label, plist, file } = serviceDefinition(options, binary),
    marker = join(raypxHome(), `${label}.json`);
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  if (
    existsSync(file) &&
    (!existsSync(marker) ||
      JSON.parse(readFileSync(marker, "utf8")).digest !== digest(readFileSync(file, "utf8")))
  )
    throw new LocalError(
      "SERVICE_MODIFIED",
      "Service file was edited; preserve and review it before changing the installation",
    );
  if (action === "uninstall") {
    const child = Bun.spawn(["/bin/launchctl", "bootout", `gui/${process.getuid()}/${label}`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await child.exited;
    rmSync(file, { force: true });
    rmSync(marker, { force: true });
    return { installed: false };
  }
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporary, plist, { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
  writeFileSync(marker, JSON.stringify({ digest: digest(plist) }), { mode: 0o600 });
  try {
    await connectDaemon(options, false);
    return { installed: true, activationPending: true };
  } catch (error) {
    if (!(error instanceof LocalError) || error.code !== "HOST_NOT_RUNNING") throw error;
  }
  const child = Bun.spawn(["/bin/launchctl", "bootstrap", `gui/${process.getuid()}`, file], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await child.exited) !== 0)
    throw new LocalError(
      "SERVICE_START_FAILED",
      "Service files were installed but launchd did not activate them",
    );
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await connectDaemon(options, false);
      break;
    } catch (error) {
      if (
        !(error instanceof LocalError) ||
        error.code !== "HOST_NOT_RUNNING" ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { installed: true, activationPending: false };
}
