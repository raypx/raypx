import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";

export function sandboxPlan(args: string[], env: NodeJS.ProcessEnv, id: string, bun: string) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      "engine-socket": { type: "string" },
      "with-egress": { type: "boolean", default: false },
    },
  });
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid sandbox validation run ID");
  const hostSocket = env.DOCKER_HOST?.startsWith("unix://")
    ? env.DOCKER_HOST.slice("unix://".length)
    : "/var/run/docker.sock";
  const socket = values["engine-socket"] ?? hostSocket;
  if (!isAbsolute(socket) || socket.includes("\0"))
    throw new Error("--engine-socket must be an absolute Unix socket path");
  const namespace = `raypx-sandbox-${id}`;
  return {
    id,
    socket,
    namespace,
    network: `${namespace}-computers`,
    bridge: `rpx${createHash("sha256").update(namespace).digest("hex").slice(0, 10)}`,
    image: `raypx/sandbox-validation:${id}`,
    memory: 268_435_456,
    pids: 64,
    withEgress: values["with-egress"],
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
