import { BrowserLanguageProvider } from "../../src/i18n.js";
import { createRoot } from "react-dom/client";
import { Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskWorkspace, type TaskWorkspacePort } from "@raypx/tasks/client";
import type { AgentTask, TaskActivity } from "@raypx/core/tasks";
import { Button } from "@raypx/ui/components/ui/button";
import "./styles.css";
const now = "2026-11-06T00:00:00.000Z";
const task: AgentTask = {
  id: "00000000-0000-4000-8000-000000000001",
  deviceId: "00000000-0000-4000-8000-000000000002",
  projectId: "00000000-0000-4000-8000-000000000003",
  provider: "codex",
  mode: "run",
  prompt: "Synthetic conversation",
  status: "running",
  summary: "",
  parentTaskId: null,
  createdAt: now,
  updatedAt: now,
};
const initial: Extract<TaskActivity, { kind: "message" }>[] = Array.from(
  { length: 200 },
  (_, index) => ({
    id: `message-${index}`,
    taskId: task.id,
    order: index + 1,
    revision: 1,
    kind: "message",
    text:
      `Message ${index + 1}\n\n` + "Synthetic **conversation** paragraph. ".repeat((index % 9) + 1),
    status: "complete",
    truncated: false,
    createdAt: now,
    updatedAt: now,
  }),
);
let entries = initial;
const listeners = new Set<() => void>();
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected mutation in synthetic performance fixture");
};
const client: TaskWorkspacePort = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  devices: {
    list: async () => [
      {
        id: task.deviceId,
        name: "Synthetic device",
        platform: "fixture",
        appVersion: "fixture",
        epoch: 1,
        revoked: false,
        lastSeenAt: now,
        online: true,
        projects: [
          { id: task.projectId, name: "Synthetic project", providers: ["codex"], dirty: false },
        ],
        capabilities: [
          {
            provider: "codex",
            available: true,
            definition: {
              version: 1,
              runtime: "process",
              modes: ["run", "plan"],
              approvals: true,
              modelSelection: false,
            },
            reason: "ready",
            version: "fixture",
            inputModes: ["queue", "steer"],
          },
        ],
      },
    ],
  },
  tasks: {
    list: async (input) => (input?.before ? [] : [task]),
    get: async () => ({ task, activity: entries, events: [], requests: [] }),
    create: unexpected,
    followUp: unexpected,
    cancel: unexpected,
    input: unexpected,
  },
  approvals: { list: async () => [], decide: unexpected },
};
let timer: ReturnType<typeof setInterval> | undefined;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function App() {
  const [generation, setGeneration] = useState(0);
  function reset() {
    clearInterval(timer);
    entries = initial;
    queryClient.clear();
    setGeneration((value) => value + 1);
  }
  function stream() {
    clearInterval(timer);
    let tick = 0;
    timer = setInterval(() => {
      tick++;
      entries = [
        ...initial.slice(0, -1),
        {
          ...initial.at(-1)!,
          revision: tick + 1,
          text: "Synthetic streaming update ".repeat(tick),
          status: tick === 64 ? "complete" : "streaming",
        },
      ];
      for (const listener of listeners) listener();
      if (tick === 64) clearInterval(timer);
    }, 32);
  }
  return (
    <main
      className="flex h-dvh flex-col bg-background text-foreground"
      data-fixture-generation={generation}
    >
      <div className="flex shrink-0 gap-2 p-2">
        <Button id="fixture-reset" onClick={reset}>
          Reset
        </Button>
        <Button id="fixture-stream" onClick={stream}>
          Stream
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TaskWorkspace
          key={generation}
          client={client}
          scope={{ kind: "device", namespace: "strobe-fixture", workspaceId: "synthetic" }}
          deviceId={task.deviceId}
          projectId={task.projectId}
          initialTaskId={task.id}
        />
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <Suspense>
    <BrowserLanguageProvider initialPreference="en">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserLanguageProvider>
  </Suspense>,
);
