import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentCapability, AgentProvider, ProviderDefinition } from "@raypx/core/tasks";
import {
  type AdapterPorts,
  type ProcessSessionStart,
  type ProcessAdapterFactory,
  type ProviderSession,
} from "@raypx/providers/core";
import { piDefinition } from "@raypx/providers/pi";
import { ClaudeAdapter, claudeDefinition } from "@raypx/providers/claude";
import { CodexAdapter, codexDefinition } from "@raypx/providers/codex";
import { createTransport, type TransportFactory } from "../../harness/transport";

type Registration = {
  kind: "process";
  definition: ProviderDefinition;
  supported(major: number, minor: number, patch: number): boolean;
  create: ProcessAdapterFactory;
};
const adapters: Record<
  AgentProvider,
  Registration | { kind: "sdk"; definition: ProviderDefinition }
> = {
  codex: {
    kind: "process",
    definition: codexDefinition,
    supported: (major, minor) => major > 0 || minor >= 163,
    create: (start, ports, transportFactory) => new CodexAdapter(start, ports, transportFactory),
  },
  claude: {
    kind: "process",
    definition: claudeDefinition,
    supported: (major, minor, patch) =>
      major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 302))),
    create: (start, ports, transportFactory) => new ClaudeAdapter(start, ports, transportFactory),
  },
  pi: { kind: "sdk", definition: piDefinition },
};
export function createAdapter(
  provider: AgentProvider,
  start: ProcessSessionStart,
  ports: AdapterPorts,
  transportFactory: TransportFactory = createTransport,
): ProviderSession {
  const registration = adapters[provider];
  if (registration.kind !== "process") throw new Error("UNSUPPORTED_CAPABILITY");
  return registration.create(start, ports, transportFactory);
}

/** Discovery is bounded in both time and output, including incompatible installations. */
export interface DiscoveryOptions {
  /** Skip PATH/HOME lookup and use only an explicit executable per provider. */
  explicitOnly?: boolean;
}

export async function discoverProviders(
  overrides: Partial<Record<AgentProvider, string>>,
  available: Map<AgentProvider, string>,
  options: DiscoveryOptions = {},
): Promise<AgentCapability[]> {
  return Promise.all(
    (Object.keys(adapters) as AgentProvider[]).map(async (provider): Promise<AgentCapability> => {
      const registration = adapters[provider];
      if (registration.kind === "sdk")
        return {
          definition: registration.definition,
          provider,
          available: false,
          version: "1",
          reason: "unconfigured",
          inputModes: [],
        };
      const suffix = process.platform === "win32" ? ".exe" : "";
      const candidates = options.explicitOnly
        ? [overrides[provider]]
        : [
            overrides[provider],
            Bun.which(provider),
            join(homedir(), ".local", "bin", provider + suffix),
            join(homedir(), ".bun", "bin", provider + suffix),
            join("/opt/homebrew/bin", provider),
          ];
      const executable = candidates.find((path) => path && existsSync(path));
      if (!executable)
        return {
          definition: adapters[provider].definition,
          provider,
          available: false,
          version: "",
          reason: "missing",
          inputModes: [],
        };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const child = Bun.spawn([executable, "--version"], { stdout: "pipe", stderr: "ignore" });
        const reader = child.stdout.getReader();
        timer = setTimeout(() => {
          child.kill();
          void reader.cancel().catch(() => {});
        }, 3000);
        let raw = "",
          size = 0;
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          size += chunk.byteLength;
          if (size > 4096) {
            child.kill();
            await reader.cancel();
            break;
          }
          raw += new TextDecoder().decode(chunk);
        }
        const code = await child.exited,
          version = raw.trim().slice(0, 120),
          match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
        const supported =
          size <= 4096 &&
          code === 0 &&
          Boolean(
            match && registration.supported(Number(match[1]), Number(match[2]), Number(match[3])),
          );
        if (supported) available.set(provider, executable);
        return {
          definition: adapters[provider].definition,
          provider,
          available: supported,
          version,
          reason: supported ? "ready" : "unsupported",
          inputModes: supported ? ["steer", "queue"] : [],
        };
      } catch {
        return {
          definition: adapters[provider].definition,
          provider,
          available: false,
          version: "",
          reason: "unsupported",
          inputModes: [],
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
