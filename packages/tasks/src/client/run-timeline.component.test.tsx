import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { RunStep } from "../model/run-steps.js";
import { RunTimeline } from "./run-timeline.js";

const steps: RunStep[] = [
  { kind: "status", key: "status:1", status: "running" },
  { kind: "tools", key: "tools:2", count: 2, running: 0, failed: 1, seconds: 3.2 },
  {
    kind: "request",
    key: "request:a",
    title: "Run migration",
    requestKind: "permission",
    status: "pending",
  },
];

function show(live: boolean) {
  return render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <RunTimeline steps={steps} live={live} />
    </BrowserLanguageProvider>,
  );
}

it("summarizes tool calls, shows request status and marks the step in flight", () => {
  show(true);
  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(screen.getByText("Running")).toBeVisible();
  expect(screen.getByText("2 tool calls")).toBeVisible();
  expect(screen.getByText("1 failed")).toBeVisible();
  expect(screen.getByText("3.2s")).toBeVisible();
  expect(screen.getByText("Run migration")).toBeVisible();
  expect(screen.getByText("Needs you")).toBeVisible();
  expect(items[2]).toHaveAttribute("aria-current", "step");
  expect(items[0]).not.toHaveAttribute("aria-current");
});

it("marks no step as current once the session has ended", () => {
  show(false);
  for (const item of screen.getAllByRole("listitem")) {
    expect(item).not.toHaveAttribute("aria-current");
  }
});
