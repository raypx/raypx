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
  hostPids: number;
  restrictedEgress: boolean;
  hostRulesApplied: boolean;
  dnsResolver: string;
  network: string;
  bridge: string;
  instance: string;
  runtime: string;
  untrustedTenants: boolean;
  allowDefaultRuntime: boolean;
  idleMs: number;
  lifetimeMs: number;
  reapMs: number;
  homeBytes: number;
  homeEntries: number;
  spaceRunning: number;
  deploymentRunning: number;
  spaceStorageBytes: number;
  deploymentStorageBytes: number;
  namespace: string;
  networkLimits: boolean;
  networkSocket: string;
  networkHostCommand?: string[];
  networkHelper?: string;
  networkStateDirectory: string;
  networkRate: number;
  networkBurst: number;
  networkTransfer: number;
  networkSpaceDaily: number;
  networkChunk: number;
  networkConnections: number;
  networkPollMs: number;
}
function privateAddress(address: string) {
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
  function flag(name: string, fallback = "false") {
    const value = env[name] ?? fallback;
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
  const runtime = env.SANDBOX_RUNTIME ?? "runc";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(runtime))
    throw new Error("Invalid SANDBOX_RUNTIME");
  const untrustedTenants = flag("SANDBOX_UNTRUSTED_TENANTS");
  const networkLimits = flag("SANDBOX_NETWORK_LIMITS", untrustedTenants ? "true" : "false");
  if (untrustedTenants && !networkLimits)
    throw new Error("Untrusted tenants require host network limits");
  let networkHostCommand: string[] | undefined;
  if (env.SANDBOX_NETWORK_HOST_COMMAND) {
    const value: unknown = JSON.parse(env.SANDBOX_NETWORK_HOST_COMMAND);
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.length > 16 ||
      value.some((v) => typeof v !== "string" || !v || v.includes("\0"))
    )
      throw new Error("Invalid SANDBOX_NETWORK_HOST_COMMAND");
    networkHostCommand = value as string[];
  }
  const networkHelper = env.SANDBOX_NETWORK_HELPER;
  const networkSocket = env.SANDBOX_NETWORK_SOCKET ?? "/run/raypx-sandbox-network/control.sock";
  const networkStateDirectory =
    env.SANDBOX_NETWORK_STATE_DIRECTORY ?? "/var/lib/raypx-sandbox-network";
  if (
    !networkSocket.startsWith("/") ||
    !networkStateDirectory.startsWith("/") ||
    (networkHostCommand && !networkHelper?.startsWith("/"))
  )
    throw new Error("Host network policy paths must be absolute");
  if (
    untrustedTenants &&
    !(flag("SANDBOX_RESTRICTED_EGRESS") && flag("SANDBOX_HOST_RULES_APPLIED"))
  )
    throw new Error("SANDBOX_UNTRUSTED_TENANTS requires restricted egress and applied host rules");
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
  const pids = positive("SANDBOX_PIDS_LIMIT", "128", 1_000_000);
  const overhead = positive("SANDBOX_RUNTIME_PIDS_OVERHEAD", "256", 1_000_000);
  const networkRate = positive("SANDBOX_NETWORK_BYTES_PER_SECOND", "1048576", 1_000_000_000);
  const networkBurst = positive("SANDBOX_NETWORK_BURST_BYTES", "1048576", 1_000_000_000);
  if (networkRate < 1024 || networkBurst < networkRate)
    throw new Error(
      "Network burst must cover at least one second at the configured byte rate (minimum 1024)",
    );
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
    pids,
    hostPids: pids + (runtime === "runsc" ? overhead : 0),
    restrictedEgress: flag("SANDBOX_RESTRICTED_EGRESS"),
    hostRulesApplied: flag("SANDBOX_HOST_RULES_APPLIED"),
    dnsResolver,
    network: `${namespace}-computers`,
    bridge: `rpx${hash}`,
    instance: crypto.randomUUID(),
    runtime,
    untrustedTenants,
    allowDefaultRuntime: flag("SANDBOX_ALLOW_DEFAULT_RUNTIME"),
    idleMs: positive("SANDBOX_IDLE_MS", "900000", 86_400_000),
    lifetimeMs: positive("SANDBOX_MAX_LIFETIME_MS", "14400000", 604_800_000),
    reapMs: positive("SANDBOX_REAP_MS", "15000", 60_000),
    homeBytes: positive("SANDBOX_HOME_BYTES", "268435456", Number.MAX_SAFE_INTEGER),
    homeEntries: positive("SANDBOX_HOME_ENTRIES", "10000", 100_000),
    spaceRunning: positive("SANDBOX_SPACE_RUNNING", "2", 10_000),
    deploymentRunning: positive("SANDBOX_DEPLOYMENT_RUNNING", "16", 10_000),
    spaceStorageBytes: positive(
      "SANDBOX_SPACE_STORAGE_BYTES",
      "1073741824",
      Number.MAX_SAFE_INTEGER,
    ),
    deploymentStorageBytes: positive(
      "SANDBOX_DEPLOYMENT_STORAGE_BYTES",
      "8589934592",
      Number.MAX_SAFE_INTEGER,
    ),
    namespace,
    networkLimits,
    networkSocket,
    ...(networkHostCommand ? { networkHostCommand } : {}),
    ...(networkHelper ? { networkHelper } : {}),
    networkStateDirectory,
    networkRate,
    networkBurst,
    networkTransfer: positive(
      "SANDBOX_NETWORK_TRANSFER_BYTES",
      "1073741824",
      Number.MAX_SAFE_INTEGER,
    ),
    networkSpaceDaily: positive(
      "SANDBOX_NETWORK_SPACE_DAILY_BYTES",
      "10737418240",
      Number.MAX_SAFE_INTEGER,
    ),
    networkChunk: positive("SANDBOX_NETWORK_CHUNK_BYTES", "67108864", 1_073_741_824),
    networkConnections: positive("SANDBOX_NETWORK_CONNECTIONS", "64", 10000),
    networkPollMs: positive("SANDBOX_NETWORK_POLL_MS", "5000", 60000),
  };
}
