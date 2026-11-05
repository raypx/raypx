import { sleep } from "@raypx/runtime-node/process";
import { isDeepStrictEqual } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentFixtures } from "./agents.ts";
import { FakeClock } from "../../src/runtime/agents/domain/ports.ts";
import { AgentStore } from "../../src/runtime/agents/store.ts";
import type { AgentRuntime } from "../../src/runtime/agents/index.ts";
import type { StateStore } from "../../src/runtime/state/index.ts";
import type { TaskChange } from "@raypx/contracts/tasks";
import type { AgentProvider, AgentTask } from "@raypx/core/tasks";

/** Host time starts at 2026-01-01T00:00:00Z so every captured timestamp is stable. */
export const EPOCH = new Date("2026-01-01T00:00:00.000Z");
const GOLDENS = join(import.meta.dirname, "../fixtures/agents/orchestration");
const rewrite = process.env.ORCHESTRATION_GOLDENS === "write";

/** Record or compare one golden file. */
const goldenFile = (name: string) => join(GOLDENS, `${name}.json`);

/**
 * Compare a captured record with its golden, or write it when regenerating.
 * Returns a readable difference, or undefined when the golden matches; the caller
 * asserts that result, so the comparison stays visible at each test.
 */
export function goldenDifference(name: string, value: unknown) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const file = goldenFile(name);
  if (rewrite) {
    mkdirSync(GOLDENS, { recursive: true });
    writeFileSync(file, text);
    return undefined;
  }
  if (!existsSync(file))
    return `missing golden ${name}.json; regenerate with ORCHESTRATION_GOLDENS=write`;
  const recorded: unknown = JSON.parse(readFileSync(file, "utf8"));
  // Compare structurally so key order is never reported as a wire change.
  if (isDeepStrictEqual(recorded, JSON.parse(text))) return undefined;
  return [
    `golden ${name}.json changed; regenerate with ORCHESTRATION_GOLDENS=write`,
    "--- recorded",
    JSON.stringify(recorded, null, 2),
    "+++ captured",
    text.trimEnd(),
  ].join("\n");
}

const { host } = agentFixtures();

/**
 * One deterministic host around the `orchestration` fixture. `gate` resolves when
 * the provider reaches a milestone; `release` lets it continue.
 */
export async function orchestrationHost(
  provider: AgentProvider,
  scenario: string,
  fixtureName: "orchestration" | "claude-headless-plan" = "orchestration",
) {
  const fixture = await host(provider, fixtureName, undefined, {
    clock: new FakeClock(EPOCH),
  });
  if (fixtureName === "orchestration") writeFileSync(join(fixture.directory, "scenario"), scenario);
  const state: StateStore = fixture.state;
  return {
    ...fixture,
    state,
    release(name: string) {
      writeFileSync(join(fixture.directory, `release:${name}`), "");
    },
    async gate(name: string) {
      const file = join(fixture.directory, `gate:${name}`);
      for (let attempt = 0; attempt < 400; attempt++) {
        if (existsSync(file)) return;
        await sleep(5);
      }
      throw new Error(`Provider never reached gate ${name}`);
    },
    delivered(): Record<string, unknown>[] {
      const file = join(fixture.directory, "delivered");
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;

/** Sort key that ignores generated ids and timestamps, which differ per run. */
function identityFree(value: unknown) {
  return JSON.stringify(value).replace(UUID, "").replace(ISO, "");
}

/**
 * Replace identities and timestamps with stable tokens. Identical values keep the
 * same token, so relationships (a request pointing at its task, one shared
 * `updatedAt`) stay visible while the golden stays deterministic. Task and
 * request ids passed in by the test are fixed below, matching today's records.
 */
function normalizeGolden(value: unknown, fixed: Record<string, string> = {}) {
  const tokens = new Map<string, string>();
  const token = (prefix: string, raw: string) => {
    const known = fixed[raw];
    if (known) return known;
    const existing = tokens.get(raw);
    if (existing) return existing;
    const next = `${prefix}${tokens.size}`;
    tokens.set(raw, next);
    return next;
  };
  return JSON.parse(
    JSON.stringify(value)
      .replace(UUID, (raw) => token("uuid:", raw.toLowerCase()))
      .replace(ISO, (raw) => token("time:", raw)),
  ) as unknown;
}

/**
 * Persisted orchestration records: the task, the journalled events (relay replay
 * order), the task-change notifications and the request/activity projections.
 */
export function captureOrchestration(
  runtime: AgentRuntime,
  state: StateStore,
  notifications: { pendingRequest?: string; change?: TaskChange }[],
  binding: string,
  taskId: string,
  fixed: Record<string, string> = {},
) {
  const store = new AgentStore(state.db);
  return normalizeGolden(
    {
      task: store.get(taskId)?.task,
      journal: runtime.replay(binding, 0).events.map((item) => item.event),
      // Notifications that land in the same burst interleave with the recorder's
      // periodic flush; today's order between them is timing-dependent, so the
      // golden records their content in identity-free canonical order instead.
      notifications: [...notifications].sort((left, right) =>
        identityFree(left).localeCompare(identityFree(right)),
      ),
      requests: store.requests(binding, taskId),
      activity: store.activity(binding, taskId),
    },
    { [taskId]: "task", ...fixed },
  ) as {
    task: AgentTask | undefined;
    journal: unknown[];
    notifications: unknown[];
    requests: unknown[];
    activity: unknown[];
  };
}
