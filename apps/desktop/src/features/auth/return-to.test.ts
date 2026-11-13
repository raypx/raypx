import { expect, it } from "vitest";
import { desktopReturnTo } from "./return-to.js";

it.each([
  "https://outside.test/agents",
  "//outside.test/agents",
  "/\\outside.test",
  "/agents\n",
  "/login?returnTo=/agents",
  "/agents/../login",
  "/%2f%2foutside.test",
  "/settings",
  null,
  "/tasks?scope=remote",
  "/approvals",
  "/files",
  "/terminal",
  "/automations",
  "/welcome",
])("returns to Agents for an unavailable desktop destination %s", (input) => {
  expect(desktopReturnTo(input)).toBe("/agents");
});
it("retains the selected Space, Agent and standalone library through login", () => {
  expect(desktopReturnTo("/agents?spaceId=space&agentId=agent#settings")).toBe(
    "/agents?spaceId=space&agentId=agent#settings",
  );
  expect(desktopReturnTo("/memory?scope=account")).toBe("/memory?scope=account");
  expect(desktopReturnTo("/account")).toBe("/account");
});
