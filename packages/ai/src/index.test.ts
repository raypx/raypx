import { describe, expect, it } from "vite-plus/test";

import { collectRun, createFakeProvider } from "./index.js";

describe("AI provider boundary", () => {
  it("normalizes a run into stable Voidmix events", async () => {
    const provider = createFakeProvider();
    const session = await provider.createSession({ projectId: "project-1" });
    const events = await collectRun(provider, {
      session,
      project: { id: "project-1", title: "Northstar" },
      prompt: "Prepare next steps",
    });
    expect(events.map((event) => event.type)).toEqual([
      "thinking",
      "text_delta",
      "thinking",
      "completed",
    ]);
  });
});

it("delegates tools to authorized V2 commands with a trusted actor", async () => {
  const { createProjectAgentTools } = await import("./index.js");
  const calls: unknown[] = [];
  const denied = new Error("permission denied");
  const tools = createProjectAgentTools({
    actorId: "trusted",
    projects: {
      async get(input) {
        calls.push(input);
        return null;
      },
      async listTasks(input) {
        calls.push(input);
        return [];
      },
      async createTask(input) {
        calls.push(input);
        throw denied;
      },
      async updateTask(input) {
        calls.push(input);
        throw denied;
      },
    },
  });
  expect(tools.names()).toEqual(["get_project", "list_tasks", "create_task", "update_task"]);
  await expect(
    tools.invoke("get_project", { projectId: "project-1", actorId: "forged" }),
  ).resolves.toBeNull();
  await expect(tools.invoke("list_tasks", { projectId: "project-1" })).resolves.toEqual([]);
  await expect(tools.invoke("create_task", { projectId: "project-1", title: "Task" })).rejects.toBe(
    denied,
  );
  await expect(tools.invoke("update_task", { taskId: "task-1", status: "done" })).rejects.toBe(
    denied,
  );
  expect(calls).toEqual([
    { projectId: "project-1", actorId: "trusted" },
    { projectId: "project-1", actorId: "trusted" },
    { projectId: "project-1", title: "Task", actorId: "trusted" },
    { taskId: "task-1", status: "done", actorId: "trusted" },
  ]);
  await expect(tools.invoke("unknown", {})).rejects.toThrow("Unknown AI tool");
  await expect(tools.invoke("create_task", {})).rejects.toThrow("Missing AI tool input");
});
