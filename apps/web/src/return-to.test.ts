import { expect, it } from "vitest";
import { safeReturnTo } from "./features/auth/return-to.js";
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
  expect(safeReturnTo("/agents?spaceId=space&agentId=agent#settings/account")).toBe(
    "/agents?spaceId=space&agentId=agent#settings/account",
  );
  expect(safeReturnTo("/settings")).toBe("/settings");
  expect(safeReturnTo("/memory")).toBe("/memory");
  for (const retired of ["/projects", "/tasks", "/approvals", "/automations"])
    expect(safeReturnTo(retired)).toBe("/");
});

it("only resumes Desktop authorization with a valid request", () => {
  const path = "/desktop-authorize?oauth=nonce%3Dabc%26sig%3Dxyz";
  expect(safeReturnTo(`${path}&unrelated=ignored#fragment`)).toBe(path);
  expect(safeReturnTo("/desktop-authorize?oauth=")).toBe("/");
});
