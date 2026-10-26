import { expect, it } from "vite-plus/test";
import { safeReturnTo } from "../../src/features/auth/return-to";
it.each([
  "https://evil.test/tasks",
  "//evil.test/tasks",
  "/\\evil.test",
  "javascript:alert(1)",
  "/%2f%2fevil.test",
  "/login?returnTo=/tasks",
  "/tasks\n",
  "/tasks/../login",
  null,
])("rejects unsafe authentication destination %s", (value) =>
  expect(safeReturnTo(value)).toBe("/"),
);
it("preserves a valid application path, query and fragment", () => {
  expect(safeReturnTo("/tasks?from=guest#editor")).toBe("/tasks?from=guest#editor");
  expect(safeReturnTo("/settings")).toBe("/settings");
});
