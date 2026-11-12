import { BrowserLanguageProvider } from "../../tests/i18n.js";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import type { TaskActivity } from "@raypx/core/tasks";
import { ToolActivityRow } from "./tool-activity.js";

type ToolActivity = Extract<TaskActivity, { kind: "tool" }>;

function tool(overrides: Partial<ToolActivity>): ToolActivity {
  return {
    id: "8d2a4a39-7c6f-4d0b-9f1f-0a3b2c1d4e5f",
    taskId: "0f8b2c64-2f4e-4d0a-8b8f-6c7d5e4f3a2b",
    order: 1,
    revision: 1,
    createdAt: "2026-11-10T08:00:00.000Z",
    updatedAt: "2026-11-10T08:00:02.400Z",
    kind: "tool",
    name: "Edit",
    status: "succeeded",
    ...overrides,
  };
}

function show(entry: ToolActivity) {
  return render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <ToolActivityRow entry={entry} first last />
    </BrowserLanguageProvider>,
  );
}

it("shows a finished call's duration and status without a busy state", () => {
  const { container } = show(tool({}));
  expect(screen.getByText("Edit")).toBeVisible();
  expect(screen.getByText("2.4s")).toBeVisible();
  expect(screen.getByText("Completed")).toBeVisible();
  expect(container.firstElementChild).toHaveAttribute("aria-busy", "false");
});

it("marks a running call busy and counts its elapsed time", () => {
  const createdAt = new Date(Date.now() - 75_000).toISOString();
  const { container } = show(tool({ status: "running", createdAt, updatedAt: createdAt }));
  expect(screen.getByText("Running")).toBeVisible();
  expect(screen.getByText(/^1\.\dm$/)).toBeVisible();
  expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
});
