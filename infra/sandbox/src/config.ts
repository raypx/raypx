import { createHash } from "node:crypto";
import { isIP } from "node:net";
export interface SandboxConfig {
  address: string;
  port: number;
  token: string;
  socket: string;
  stateDirectory: string;
  image: string;
  graphical?: boolean;
  memory: number;
  nanoCpus: number;
  pids: number;
  restrictedEgress: boolean;
  hostRulesApplied: boolean;
  dnsResolver: string;
  network: string;
  bridge: string;
}
export function privateAddress(address: string) {
  if (!isIP(address)) return false;
  if (address === "::1" || /^f[cd][0-9a-f]{2}:/i.test(address)) return true;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168);
}
export function sandboxConfig(env: Record<string, string | undefined>): SandboxConfig {
  function positive(name: string, fallback: string, max: number) {
    const value = env[name] ?? fallback;
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max)
      throw new Error(`Invalid ${name}`);
    return Number(value);
  }
  function flag(name: string) {
    const value = env[name] ?? "false";
    if (value !== "true" && value !== "false") throw new Error(`Invalid ${name}`);
    return value === "true";
  }
  const address = env.SANDBOX_LISTEN_ADDRESS ?? "127.0.0.1";
  if (!privateAddress(address))
    throw new Error("Invalid SANDBOX_LISTEN_ADDRESS: explicit private IP required");
  const token = env.SANDBOX_SUPERVISOR_TOKEN ?? "";
  if (token.length < 32 || /[\r\n]/.test(token))
    throw new Error("Invalid SANDBOX_SUPERVISOR_TOKEN");
  for (const [key, value] of Object.entries(env)) {
    if (key !== "SANDBOX_SUPERVISOR_TOKEN" && value === token)
      throw new Error("SANDBOX_SUPERVISOR_TOKEN must be dedicated");
  }
  const image = env.SANDBOX_COMPUTER_IMAGE ?? "";
  // Locally built images have an immutable Engine image ID before registry publication.
  if (!/^(?:[a-zA-Z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("Invalid SANDBOX_COMPUTER_IMAGE: digest required");
  const namespace = env.SANDBOX_NAMESPACE ?? "raypx";
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(namespace)) throw new Error("Invalid SANDBOX_NAMESPACE");
  const hash = createHash("sha256").update(namespace).digest("hex").slice(0, 10);
  const stateDirectory = env.SANDBOX_STATE_DIRECTORY ?? "/var/lib/raypx-sandbox";
  if (!stateDirectory.startsWith("/")) throw new Error("Invalid SANDBOX_STATE_DIRECTORY");
  const socket = env.SANDBOX_ENGINE_SOCKET ?? "/var/run/docker.sock";
  if (!socket.startsWith("/") || socket.includes("\0"))
    throw new Error("Invalid SANDBOX_ENGINE_SOCKET");
  const dnsResolver = env.SANDBOX_DNS_RESOLVER ?? "1.1.1.1";
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
    throw new Error("Invalid SANDBOX_DNS_RESOLVER: public IPv4 required");
  return {
    address,
    port: positive("SANDBOX_PORT", "4020", 65535),
    token,
    socket,
    stateDirectory,
    image,
    graphical: flag("SANDBOX_GRAPHICAL"),
    memory: positive("SANDBOX_MEMORY_BYTES", "536870912", Number.MAX_SAFE_INTEGER),
    nanoCpus: positive("SANDBOX_NANO_CPUS", "1000000000", 256_000_000_000),
    pids: positive("SANDBOX_PIDS_LIMIT", "128", 1_000_000),
    restrictedEgress: flag("SANDBOX_RESTRICTED_EGRESS"),
    hostRulesApplied: flag("SANDBOX_HOST_RULES_APPLIED"),
    dnsResolver,
    network: `${namespace}-computers`,
    bridge: `rpx${hash}`,
  };
}
