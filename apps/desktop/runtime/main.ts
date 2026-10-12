import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { RunnerJournal } from "./journal.js";
import { LocalRunner } from "./runner.js";
import { createRunnerCloud, type DeviceConfiguration } from "./cloud.js";
import type { RunnerBinding } from "./types.js";

if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("The desktop runner requires bundled Node 24.");
const directory = process.argv[2];
if (!directory) throw new Error("A native application data directory is required.");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const journal = new RunnerJournal(join(directory, "journal.sqlite"));
const runner = new LocalRunner(journal, directory);
const configuration = journal.setting<DeviceConfiguration>("cloud");
if (configuration) runner.connect(createRunnerCloud(configuration), configuration.deviceId);
const write = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
runner.subscribe((event) => write({ event }));
const timer = setInterval(() => {
  void runner.tick();
}, 1_000);
const readline = createInterface({ input: process.stdin });
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  readline.close();
  await runner.stop();
  journal.close();
  process.exitCode = 0;
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
readline.on("close", () => {
  void shutdown();
});
readline.on("line", (line) => {
  // Requests may run concurrently: approval/cancel must reach an awaiting tool.
  void (async () => {
    let id: unknown = null;
    try {
      if (line.length > 128 * 1024) throw new Error("Runner request is too large.");
      const request = JSON.parse(line) as { id: string; method: string; input?: unknown };
      id = request.id;
      if (typeof request.id !== "string" || !request.id) throw new Error("Invalid runner request.");
      const input = request.input as Record<string, unknown> | undefined;
      let result: unknown = null;
      switch (request.method) {
        case "status":
          result = runner.status();
          break;
        case "configure": {
          const value = input as unknown as DeviceConfiguration;
          if (!value?.apiUrl || !value.deviceId || !value.credential)
            throw new Error("A cloud URL and device registration are required.");
          const cloud = createRunnerCloud(value);
          await cloud.heartbeat();
          journal.setSetting("cloud", value);
          runner.connect(cloud, value.deviceId);
          break;
        }
        case "grant":
          result = await runner.grant(input as unknown as Omit<RunnerBinding, "localBindingId">);
          break;
        case "revoke":
          await runner.revoke(String(input?.localBindingId ?? ""));
          break;
        case "cancel":
          await runner.cancel(String(input?.runId ?? ""));
          break;
        case "steer":
          await runner.steer(String(input?.runId ?? ""), String(input?.prompt ?? ""));
          break;
        case "approve": {
          if (input?.decision !== "approve" && input?.decision !== "deny")
            throw new Error("Invalid approval decision.");
          runner.approve(String(input.runId), String(input.approvalId), input.decision);
          break;
        }
        case "shutdown":
          await shutdown();
          break;
        default:
          throw new Error("Unknown runner method.");
      }
      write({ id, result });
    } catch (error) {
      // SDK/network diagnostics may contain private request data; don't echo them to UI/logs.
      write({
        id,
        error:
          error instanceof Error &&
          /^(Invalid|Unknown|A cloud|Tool|Approval|Run is|The project|Project and|Unsupported|Runner request)/.test(
            error.message,
          )
            ? error.message
            : "Local runner request failed. Check configuration and availability.",
      });
    }
  })();
});
