/** @vitest-environment happy-dom */
import { createMemoryHistory, createRouter, type AnyRoute } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";
import { routeTree } from "../../../../src/routeTree.gen";

function leaves(route: AnyRoute): AnyRoute[] {
  const children = Object.values((route.children ?? {}) as Record<string, AnyRoute>);
  return children.length ? children.flatMap(leaves) : [route];
}

// Creating a router assigns each generated route its id and full path.
function pages() {
  createRouter({ routeTree, history: createMemoryHistory() });
  return leaves(routeTree);
}

describe("Desktop shell pages", () => {
  it("declare a translated title and page template for every shell route", () => {
    const shellPages = pages().filter((route) => !route.id.startsWith("/(auth)"));
    expect(
      Object.fromEntries(
        shellPages.map((route) => [route.fullPath, route.options.staticData?.page]),
      ),
    ).toEqual({
      "/": { title: "common.files", layout: "tool" },
      "/account": { title: "common.account", layout: "document" },
      "/approvals": { title: "common.approvals", layout: "workbench" },
      "/automations": { title: "common.jobs", layout: "workbench" },
      "/memory": { title: "memory.title", layout: "workbench" },
      "/settings": { title: "common.settings", layout: "document" },
      "/tasks": { title: "common.tasks", layout: "workbench" },
      "/terminal": { title: "common.terminal", layout: "tool" },
      "/welcome": { title: "localWorkspace.welcome", layout: "document" },
    });
  });
});
