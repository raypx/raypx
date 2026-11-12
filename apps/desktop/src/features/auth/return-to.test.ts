import { expect, it } from "vitest";
import { desktopReturnTo } from "./return-to.js";

it.each([
  "https://outside.test/tasks",
  "//outside.test/tasks",
  "/\\outside.test",
  "/tasks\n",
  "/login?returnTo=/tasks",
  "/tasks/../login",
  "/%2f%2foutside.test",
  "/settings",
  null,
])("rejects an unsafe desktop login destination %s", (input) => {
  expect(desktopReturnTo(input)).toBe("/");
});
it("retains local/remote scope and the selected project through login", () => {
  expect(desktopReturnTo("/tasks?scope=remote#editor")).toBe("/tasks?scope=remote#editor");
  expect(desktopReturnTo("/approvals?scope=local&project=project-a")).toBe(
    "/approvals?scope=local&project=project-a",
  );
  expect(desktopReturnTo("/tasks?scope=remote&project=project-a#settings")).toBe(
    "/tasks?scope=remote&project=project-a#settings",
  );
});
