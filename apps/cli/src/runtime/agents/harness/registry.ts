import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentCapability, AgentProvider, AgentTask } from "@raypx/contracts/tasks";
import { CodexProvider } from "./providers/codex";
import { ClaudeProvider } from "./providers/claude";
import { createProcess, type AskApproval } from "./providers/process";

/** Lifecycle port also permits future in-process drivers. No protocol/process API escapes. */
export interface ExecutionHandle {
  readonly completed: Promise<number>;
  kill(): Promise<void>;
}
export interface ExecutionDriver {
  readonly handle: ExecutionHandle;
  readonly input: "steer" | "interrupt";
  readonly holdPlanOnExit: boolean;
  readonly turnId: string | undefined;
  readonly preview: string;
  readonly summary: string;
  initialize(mode: AgentTask["mode"], sessionId?: string): Promise<string | undefined>;
  sendTurn(prompt: string, sessionId: string | null, mode: AgentTask["mode"]): Promise<void>;
  steer(prompt: string, sessionId: string | null): Promise<void>;
  interrupt(sessionId?: string | null): Promise<void>;
}
interface DriverPorts {
  approval: { ask: AskApproval; hook(): { url: string; token: string } };
  current(handle: ExecutionHandle): boolean;
  codexRecord(method: string, params: Record<string, unknown>): void;
  claudeRecord(message: Record<string, unknown>): void;
  session(id: string): void;
  codexCompleted(driver: ExecutionDriver, status: unknown, turnId?: string): void;
  claudeCompleted(handle: ExecutionHandle, message: Record<string, unknown>): void;
  failed(handle: ExecutionHandle): void;
  turnId(id: string): void;
}
type Start = {
  executable: string;
  directory: string;
  mode: AgentTask["mode"];
  environment: Record<string, string | undefined>;
  sessionId?: string;
};
type Registration = {
  supported(major: number, minor: number, patch: number): boolean;
  create(start: Start, ports: DriverPorts): ExecutionDriver;
};
const registry: Record<AgentProvider, Registration> = {
  codex: {
    supported: (major, minor) => major > 0 || minor >= 163,
    create(start, ports) {
      const provider = new CodexProvider(
        start.executable,
        start.directory,
        {
          current: () => ports.current(driver.handle),
          record: (method, params) => ports.codexRecord(method, params),
          ask: ports.approval.ask,
          completed: (status, turnId) => ports.codexCompleted(driver, status, turnId),
          failed: () => ports.failed(driver.handle),
          turnId: (id) => ports.turnId(id),
        },
        (executable, args, directory, onMessage) =>
          createProcess(executable, args, directory, onMessage, start.environment),
      );
      const driver: ExecutionDriver = {
        handle: { completed: provider.process.completed, kill: () => provider.process.kill() },
        input: "steer",
        holdPlanOnExit: false,
        get turnId() {
          return provider.turnId;
        },
        get preview() {
          return provider.preview;
        },
        get summary() {
          return provider.summary;
        },
        initialize: (mode, sessionId) => provider.initialize(mode, sessionId),
        sendTurn: (prompt, sessionId, mode) => provider.sendTurn(prompt, sessionId, mode),
        steer: async (prompt, sessionId) => {
          await provider.steer(prompt, sessionId);
        },
        interrupt: async (sessionId) => {
          await provider.interrupt(sessionId ?? null);
        },
      };
      return driver;
    },
  },
  claude: {
    supported: (major, minor, patch) =>
      major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 302))),
    create(start, ports) {
      const hook = ports.approval.hook();
      const provider = new ClaudeProvider(
        start.executable,
        start.directory,
        {
          mode: start.mode,
          ...(start.sessionId ? { sessionId: start.sessionId } : {}),
          hookUrl: hook.url,
          hookToken: hook.token,
          environment: start.environment,
        },
        {
          current: () => ports.current(driver.handle),
          record: (message) => ports.claudeRecord(message),
          session: (id) => ports.session(id),
          completed: (message) => ports.claudeCompleted(driver.handle, message),
        },
      );
      const driver: ExecutionDriver = {
        handle: { completed: provider.process.completed, kill: () => provider.process.kill() },
        input: "interrupt",
        holdPlanOnExit: true,
        turnId: undefined,
        preview: "",
        summary: "",
        initialize: async () => undefined,
        sendTurn: (prompt, sessionId) => provider.sendTurn(prompt, sessionId),
        steer: async () => {
          throw new Error("Use interrupt before the next Claude turn");
        },
        interrupt: async () => {
          await provider.interrupt();
        },
      };
      return driver;
    },
  },
};
export function createDriver(provider: AgentProvider, start: Start, ports: DriverPorts) {
  return registry[provider].create(start, ports);
}

/** Discovery is bounded in both time and output, including incompatible installations. */
export async function discoverProviders(
  overrides: Partial<Record<AgentProvider, string>>,
  available: Map<AgentProvider, string>,
): Promise<AgentCapability[]> {
  return Promise.all(
    (Object.keys(registry) as AgentProvider[]).map(async (provider): Promise<AgentCapability> => {
      const suffix = process.platform === "win32" ? ".exe" : "";
      const executable = [
        overrides[provider],
        Bun.which(provider),
        join(homedir(), ".local", "bin", provider + suffix),
        join(homedir(), ".bun", "bin", provider + suffix),
        join("/opt/homebrew/bin", provider),
      ].find((path) => path && existsSync(path));
      if (!executable) return { provider, available: false, version: "", reason: "missing" };
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
            match &&
            registry[provider].supported(Number(match[1]), Number(match[2]), Number(match[3])),
          );
        if (supported) available.set(provider, executable);
        return {
          provider,
          available: supported,
          version,
          reason: supported ? "ready" : "unsupported",
          ...(supported ? { inputModes: ["steer", "queue"] } : {}),
        };
      } catch {
        return { provider, available: false, version: "", reason: "unsupported" };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}
