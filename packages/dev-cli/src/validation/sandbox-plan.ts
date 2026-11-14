import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { isIP } from "node:net";
import { parseArgs } from "node:util";

export function sandboxPlan(args: string[], env: NodeJS.ProcessEnv, id: string, bun: string) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      runtime: { type: "string", default: "runc" },
      "engine-socket": { type: "string" },
      "with-egress": { type: "boolean", default: false },
      "dns-resolver": { type: "string", default: "1.1.1.1" },
      "engine-host-command": { type: "string" },
    },
  });
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid sandbox validation run ID");
  const hostSocket = env.DOCKER_HOST?.startsWith("unix://")
    ? env.DOCKER_HOST.slice("unix://".length)
    : "/var/run/docker.sock";
  const socket = values["engine-socket"] ?? hostSocket;
  if (!isAbsolute(socket) || socket.includes("\0"))
    throw new Error("--engine-socket must be an absolute Unix socket path");
  const dnsResolver = values["dns-resolver"];
  const [a, b, c] = dnsResolver.split(".").map(Number);
  if (
    isIP(dnsResolver) !== 4 ||
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c!)))) ||
    (a === 198 && ([18, 19].includes(b!) || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  )
    throw new Error("--dns-resolver must be a public IPv4 address");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(values.runtime))
    throw new Error("Invalid --runtime");
  const namespace = `raypx-sandbox-${id}`;
  let engineHostCommand: string[] | undefined;
  if (values["engine-host-command"] !== undefined) {
    try {
      const command: unknown = JSON.parse(values["engine-host-command"]);
      if (
        !values["with-egress"] ||
        !Array.isArray(command) ||
        command.length === 0 ||
        !command.every(
          (part) => typeof part === "string" && part.length > 0 && !part.includes("\0"),
        )
      )
        throw new Error();
      engineHostCommand = command;
    } catch {
      throw new Error("--engine-host-command requires --with-egress and a JSON argument array");
    }
  }
  return {
    id,
    runtime: values.runtime,
    socket,
    namespace,
    network: `${namespace}-computers`,
    bridge: `rpx${createHash("sha256").update(namespace).digest("hex").slice(0, 10)}`,
    image: `raypx/sandbox-validation:${id}`,
    memory: 536_870_912,
    pids: 128,
    hostPids: values.runtime === "runsc" ? 384 : 128,
    withEgress: values["with-egress"],
    dnsResolver,
    engineHostCommand,
    bases: { bun: `oven/bun:${bun}`, computer: "python:3.13-slim-bookworm" },
  };
}
export type SandboxPlan = ReturnType<typeof sandboxPlan>;

export function sandboxBaseDigest(tag: string, references: string[]): string {
  const repository = tag.slice(0, tag.lastIndexOf(":"));
  function normalize(value: string) {
    return value.replace(/^docker\.io\//, "").replace(/^library\//, "");
  }
  for (const reference of references) {
    const match = /^(.+)@sha256:([a-f0-9]{64})$/.exec(reference);
    if (match && normalize(match[1]!) === normalize(repository)) return match[2]!;
  }
  throw new Error("Requested base repository has no immutable digest");
}

/** Inherited operator sandbox settings never select a listener, state volume or credential. */
export function sandboxEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) if (key.startsWith("SANDBOX_")) delete env[key];
  delete env.NODE_ENV;
  delete env.RAYPX_TEST_DOCKER;
  return env;
}
