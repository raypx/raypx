import { BrowserLanguageProvider } from "../../tests/i18n.js";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { AgentTask } from "@raypx/core/tasks";
import { SidebarMenu, SidebarProvider } from "@raypx/ui/components/ui/sidebar";
import { createTaskClient } from "../../tests/helpers/client.js";
import { ProjectSessionGroup, type SessionLinkProps } from "./project-sessions.js";

const deviceId = crypto.randomUUID();
const projectId = crypto.randomUUID();

beforeEach(() => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});

function task(prompt: string, minute: number, overrides: Partial<AgentTask> = {}): AgentTask {
  const at = new Date(Date.UTC(2026, 10, 10, 8, minute)).toISOString();
  return {
    id: crypto.randomUUID(),
    deviceId,
    projectId,
    provider: "codex",
    mode: "run",
    prompt,
    status: "succeeded",
    summary: "",
    parentTaskId: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function SessionLink({
  projectId: project,
  deviceId: device,
  taskId,
  children,
  ...props
}: SessionLinkProps) {
  return (
    <a href={`/tasks?device=${device}&project=${project}&task=${taskId ?? ""}`} {...props}>
      {children}
    </a>
  );
}

function show(tasks: AgentTask[], props: { activeTaskId?: string; defaultOpen?: boolean } = {}) {
  const list = vi.fn(async () => tasks);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <SidebarProvider>
          <SidebarMenu>
            <ProjectSessionGroup
              client={createTaskClient({ tasks: { list } })}
              scope={{ kind: "remote", namespace: "default", accountId: "account" }}
              projectId={projectId}
              deviceId={deviceId}
              name="Raypx"
              current={Boolean(props.activeTaskId)}
              activeTaskId={props.activeTaskId}
              defaultOpen={props.defaultOpen ?? true}
              SessionLink={SessionLink}
            />
          </SidebarMenu>
        </SidebarProvider>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { list };
}

it("lists each conversation once under its project and marks the open one", async () => {
  const first = task("Fix the build", 1);
  const followUp = task("Also update the tests", 3, { parentTaskId: first.id, status: "running" });
  const other = task("Write release notes", 2, { status: "failed" });
  const { list } = show([followUp, other, first], { activeTaskId: first.id });
  const build = await screen.findByRole("link", { name: /^Fix the build/ });
  expect(build).toHaveAttribute("aria-current", "page");
  // The row opens the newest continuation and reports its status.
  expect(build).toHaveAttribute("href", expect.stringContaining(`task=${followUp.id}`));
  expect(within(build).getByText("Running")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /^Write release notes/ })).toHaveTextContent("Failed");
  expect(screen.queryByRole("link", { name: /Also update the tests/ })).toBeNull();
  // A session is open, so the project entry itself is not the current page.
  expect(screen.getByRole("link", { name: "Raypx" })).not.toHaveAttribute("aria-current");
  expect(list).toHaveBeenCalledWith({ limit: 30, projectId, deviceId }, expect.anything());
});

it("folds the list without loading it and reveals older conversations on request", async () => {
  const tasks = Array.from({ length: 7 }, (_, index) => task(`Session ${index + 1}`, 10 - index));
  const { list } = show(tasks, { defaultOpen: false });
  expect(list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show sessions in Raypx" }));
  await screen.findByRole("link", { name: "Session 1" });
  expect(screen.queryByRole("link", { name: "Session 6" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(screen.getByRole("link", { name: "Session 7" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Hide sessions in Raypx" }));
  expect(screen.queryByRole("link", { name: "Session 1" })).toBeNull();
});
