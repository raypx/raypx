import { expect, it } from "vite-plus/test";
import { desktopReturnTo } from "../../../../../src/features/auth/return-to";

it.each([
  "https://outside.test/tasks",
  "//outside.test/tasks",
  "/\\outside.test",
  "/tasks\n",
  "/login?returnTo=/tasks",
  "/tasks/../login",
  "/%2f%2foutside.test",
  null,
])("rejects an unsafe desktop login destination %s", (input) => {
  expect(desktopReturnTo(input)).toBe("/");
});
it("retains local/remote scope and the selected project through login", () => {
  expect(desktopReturnTo("/tasks?scope=remote#editor")).toBe("/tasks?scope=remote#editor");
  expect(desktopReturnTo("/approvals?scope=local&project=project-a")).toBe(
    "/approvals?scope=local&project=project-a",
  );
});
