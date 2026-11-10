import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { TaskPanels } from "../task-panels.tsx";

function panels(detailVisible: boolean) {
  return <TaskPanels list="Task list" detail="Session details" detailVisible={detailVisible} />;
}

it("shows one pane at a time: the history, or the open session", () => {
  const view = render(panels(false));
  expect(screen.getByText("Task list")).toBeVisible();
  expect(screen.getByText("Session details")).not.toBeVisible();
  view.rerender(panels(true));
  expect(screen.getByText("Task list")).not.toBeVisible();
  expect(screen.getByText("Session details")).toBeVisible();
});
