import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { TaskWorkspace } from "@raypx/tasks/client";
import { createTaskClient } from "../../helpers/client.js";

it("loads approvals independently when the task list is unavailable", async () => {
  localStorage.setItem("raypx_locale", "en");
  const tasks = vi.fn(async (): Promise<never> => {
    throw new Error("Task list unavailable");
  });
  const devices = vi.fn(async (): Promise<never> => {
    throw new Error("Devices unavailable");
  });
  const approvals = vi.fn(async () => []);
  const client = createTaskClient({
    tasks: { list: tasks },
    approvals: { list: approvals },
    devices: { list: devices },
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <TaskWorkspace
          client={client}
          view="approvals"
          scope={{ kind: "remote", namespace: "test", accountId: "account" }}
        />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(approvals).toHaveBeenCalledOnce());
  expect(tasks).not.toHaveBeenCalled();
  expect(devices).not.toHaveBeenCalled();
  expect(await screen.findByText("Nothing needs your answer.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
