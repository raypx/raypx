import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { TaskComposer } from "@raypx/tasks/client/task-composer";
import type { TaskWorkspaceClient } from "@raypx/tasks/client";
import type { TaskContextSelection } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { MemoryClientPort } from "@raypx/memory/client";
import { selectOption } from "../../helpers/select";
const deviceId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  sourceId = "33333333-3333-4333-8333-333333333333",
  otherProject = "44444444-4444-4444-8444-444444444444";
const device: SyncDevice = {
  id: deviceId,
  name: "My computer",
  platform: "darwin",
  appVersion: "1",
  epoch: 1,
  revoked: false,
  lastSeenAt: null,
  online: true,
  projects: [
    { id: projectId, name: "Current project", providers: ["claude"], dirty: false },
    { id: otherProject, name: "Other project", providers: ["claude"], dirty: false },
  ],
  capabilities: [{ provider: "claude", available: true, version: "1", reason: "ready" }],
};
const selection: TaskContextSelection = { sources: [{ id: sourceId, revision: 3 }] };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
function fixture(guest = false) {
  const list = vi.fn<MemoryClientPort["list"]>(async () => [
    {
      id: sourceId,
      revision: 3,
      kind: "template",
      name: "Review template",
      category: "Review",
      project: null,
      archived: false,
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
  ]);
  const library = { list } as unknown as MemoryClientPort;
  const create = vi.fn<TaskWorkspaceClient["tasks"]["create"]>(async (input) => ({
    ...input,
    summary: "",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "running",
  }));
  const client = { tasks: { create } } as unknown as TaskWorkspaceClient;
  const signIn = vi.fn();
  function Composer() {
    const prompt = useRef<HTMLTextAreaElement>(null),
      [options, setOptions] = useState(true);
    return (
      <TaskComposer
        client={client}
        contextLibrary={library}
        devices={[device]}
        tasks={[]}
        onCreated={() => {}}
        local
        draftKey="device-context-draft"
        promptRef={prompt}
        optionsOpen={options}
        onOptionsOpenChange={setOptions}
        initialDraft={{
          deviceId,
          projectId,
          provider: "claude",
          mode: "run",
          prompt: "Review changes",
          contextSelection: selection,
        }}
        {...(guest ? { guest: { signIn } } : {})}
      />
    );
  }
  render(
    <BrowserLanguageProvider>
      <Composer />
    </BrowserLanguageProvider>,
  );
  return { list, create, signIn };
}
it("saves source revisions in a draft and sends only the selection when creating a task", async () => {
  const { list, create } = fixture();
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "Save draft" }));
  expect(JSON.parse(localStorage.getItem("device-context-draft")!)[0].contextSelection).toEqual(
    selection,
  );
  fireEvent.submit(
    screen.getByRole("textbox", { name: "What should the agent do?" }).closest("form")!,
  );
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]?.[0]).toMatchObject({ contextSelection: selection });
  expect(create.mock.calls[0]?.[0]).not.toHaveProperty("context");
});
it("clears selected references when the target project changes", async () => {
  const { create } = fixture();
  await selectOption("Project", otherProject);
  fireEvent.submit(
    screen.getByRole("textbox", { name: "What should the agent do?" }).closest("form")!,
  );
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0]?.[0]).toMatchObject({ projectId: otherProject });
  expect(create.mock.calls[0]?.[0].contextSelection).toBeUndefined();
});
it("does not read private references or carry saved source IDs through a guest sign-in", async () => {
  const { list, create, signIn } = fixture(true);
  await userEvent.click(screen.getByRole("button", { name: "Sign in to send" }));
  expect(list).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(signIn.mock.calls[0]?.[0]).not.toHaveProperty("contextSelection");
});
