import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { ModelCatalog, ModelSelection, AgentTask } from "@raypx/core/tasks";
import type { TaskWorkspacePort } from "../model/port.ts";
import { TaskDetail } from "./task-detail.tsx";
import { createTaskClient } from "../../tests/helpers/client.ts";
import { selectOption } from "../../tests/helpers/select.ts";

it("asks before sending a Pi conversation to a different connection and binds the confirmed revision", async () => {
  localStorage.setItem("raypx_locale", "en");
  const model: ModelSelection = {
    provider: "first",
    model: "fixture",
    connectionId: "a".repeat(64),
  };
  const target: ModelSelection = {
    provider: "second",
    model: "fixture",
    connectionId: "b".repeat(64),
  };
  const task: AgentTask = {
    id: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    provider: "pi",
    mode: "run",
    model,
    prompt: "Synthetic task",
    status: "succeeded",
    summary: "Done",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const followUp = vi.fn(async (input: Parameters<TaskWorkspacePort["tasks"]["followUp"]>[0]) => ({
    ...task,
    ...input,
  }));
  const catalog: ModelCatalog = {
    default: model,
    models: [model, target].map((selection) => ({
      id: selection.model,
      name: selection.model,
      provider: selection.provider,
      selection,
      api: "openai-completions",
      input: ["text"],
      reasoning: false,
      contextWindow: 4096,
      maxTokens: 512,
      configured: true,
      origin: "https://" + selection.provider + ".invalid",
    })),
  };
  const base = createTaskClient({
    tasks: {
      get: async () => ({
        task,
        events: [],
        requests: [],
        activity: [],
        continuation: { revision: 7, model, blocked: false },
      }),
      followUp,
    },
  });
  let completeCatalog: (value: ModelCatalog) => void = () => {};
  const client: TaskWorkspacePort = {
    ...base,
    models: {
      list: () =>
        new Promise((resolve) => {
          completeCatalog = resolve;
        }),
      setDefault: async ({ model: value }) => ({ default: value }),
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskDetail
          client={client}
          id={task.id}
          scope={{ kind: "device", namespace: "test", workspaceId: "device" }}
          onChanged={() => {}}
          devices={[
            {
              id: task.deviceId,
              name: "Device",
              platform: "darwin",
              appVersion: "test",
              epoch: 1,
              revoked: false,
              lastSeenAt: null,
              online: true,
              projects: [{ id: task.projectId, name: "Project", providers: ["pi"], dirty: false }],
              capabilities: [
                {
                  provider: "pi",
                  available: true,
                  version: "1",
                  reason: "ready",
                  inputModes: ["queue"],
                  definition: {
                    version: 1,
                    runtime: "sdk",
                    modes: ["plan", "run"],
                    approvals: true,
                    modelSelection: true,
                  },
                },
              ],
            },
          ]}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  const prompt = await screen.findByRole("textbox", { name: "Follow up in the same session" });
  expect(screen.getByText("Checking model availability…")).toBeInTheDocument();
  expect(
    screen.queryByText("The model connection changed. Choose a model again."),
  ).not.toBeInTheDocument();
  await act(async () => completeCatalog(catalog));
  fireEvent.change(prompt, { target: { value: "Continue synthetically" } });
  await selectOption("Model", JSON.stringify([target.provider, target.model, target.connectionId]));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Send session" })).not.toBeDisabled(),
  );
  fireEvent.submit(prompt.closest("form")!);
  await screen.findByRole("alertdialog");
  expect(followUp).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send context" }));
  await waitFor(() =>
    expect(followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        parentTaskId: task.id,
        model: target,
        contextRevision: 7,
        contextTransfer: { revision: 7, connectionId: target.connectionId },
      }),
      expect.anything(),
    ),
  );
});
