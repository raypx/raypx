import type { AgentProvider } from "@raypx/core/tasks";
import type { PiExecutionServices } from "../../pi/ports";
import { ProviderRegistry, type ProviderDriver } from "../../application/providers";
import { createAdapter, discoverProviders } from "./process";
import type { TransportFactory } from "../../harness/transport";
import { LocalError } from "../../../errors";

export function builtinDrivers(
  overrides: Partial<Record<AgentProvider, string>> = {},
  pi?: PiExecutionServices,
  transport?: TransportFactory,
  /** Tests pass explicit executables and must not discover a real installation. */
  explicitOnly = false,
): ProviderDriver[] {
  const executables = new Map<AgentProvider, string>();
  let probes: ReturnType<typeof discoverProviders> | undefined;
  const discovery = () => (probes ??= discoverProviders(overrides, executables, { explicitOnly }));
  const processDrivers: ProviderDriver[] = (["codex", "claude"] as const).map((provider) => ({
    provider,
    remote: true,
    async discover() {
      return (await discovery()).find((entry) => entry.provider === provider)!;
    },
    async prepare() {
      const executable = executables.get(provider);
      if (!executable) throw new LocalError("AGENT_UNAVAILABLE", "Provider unavailable");
      return {
        factory: (start, ports) =>
          createAdapter(provider, { ...start, executable }, ports, transport),
        dispose() {},
      };
    },
  }));
  return [
    ...processDrivers,
    {
      provider: "pi",
      remote: false,
      async discover() {
        const capability = (await discovery()).find((entry) => entry.provider === "pi")!;
        const available = (await pi?.available()) ?? false;
        return {
          ...capability,
          available,
          reason: available ? "ready" : "unconfigured",
          inputModes: available ? ["queue"] : [],
        };
      },
      inspect: (local) => pi?.inspect(local),
      async prepare(local, parent, follow) {
        if (!pi) throw new LocalError("AGENT_UNAVAILABLE", "Pi execution unavailable");
        return pi.prepare(local, parent, follow);
      },
    },
  ];
}

export function createProviderRegistry(
  overrides: Partial<Record<AgentProvider, string>> = {},
  pi?: PiExecutionServices,
  transport?: TransportFactory,
  explicitOnly = false,
) {
  return new ProviderRegistry(builtinDrivers(overrides, pi, transport, explicitOnly));
}
