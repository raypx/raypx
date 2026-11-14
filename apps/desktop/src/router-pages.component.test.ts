/** @vitest-environment happy-dom */
import { createMemoryHistory, createRouter, type AnyRoute } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "./routeTree.gen.js";

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
      "/": undefined,
      "/account": { title: "common.account", layout: "document" },
      "/join": { title: "agents.spaceSettings.joinTitle", layout: "document" },
      "/agents": { title: "agents.title", layout: "tool" },
      "/pages": { title: "pages.title", layout: "tool" },
    });
  });
});
