/** @vitest-environment happy-dom */
import { createMemoryHistory, createRouter, type AnyRoute } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { routeTree } from "./routeTree.gen.js";
import { webPages } from "./features/auth/access.js";

function leaves(route: AnyRoute): AnyRoute[] {
  const children = Object.values((route.children ?? {}) as Record<string, AnyRoute>);
  return children.length ? children.flatMap(leaves) : [route];
}

// Creating a router assigns each generated route its id and full path.
function pages() {
  createRouter({
    routeTree,
    history: createMemoryHistory(),
    context: { queryClient: new QueryClient() },
  });
  return leaves(routeTree);
}

describe("application shell pages", () => {
  it("requires an explicit public or private permission policy for every shell page", () => {
    expect(
      pages()
        .filter((route) => route.id.startsWith("/(app)") || route.id.startsWith("/(admin)"))
        .map((route) => route.fullPath.replace(/\/$/, ""))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(Object.keys(webPages).sort((a, b) => a.localeCompare(b)));
  });
  it("keeps the public homepage in its own landing group", () => {
    const routes = pages();
    expect(routes.find((route) => route.fullPath === "/")?.id).toBe("/(landing)/");
    expect(routes.find((route) => route.fullPath === "/projects")?.id).toBe("/(app)/projects");
  });
  it("declare a translated title and page template for every shell route", () => {
    const shellPages = pages().filter(
      (route) => route.id.startsWith("/(app)") || route.id.startsWith("/(admin)"),
    );
    expect(
      Object.fromEntries(
        shellPages.map((route) => [route.fullPath, route.options.staticData?.page]),
      ),
    ).toEqual({
      "/projects": { title: "common.projects", layout: "workbench" },
      "/agents": { title: "agents.title", layout: "tool" },
      "/admin/": { title: "dash.nav.overview", layout: "workbench" },
      "/admin/audit": { title: "dash.nav.audit", layout: "workbench" },
      "/admin/users": { title: "common.users", layout: "workbench" },
      "/admin/settings": { title: "site.title", layout: "document" },
      "/approvals": { title: "common.approvals", layout: "workbench" },
      "/automations": { title: "common.jobs", layout: "workbench" },
      "/memory": { title: "memory.title", layout: "workbench" },
      "/settings": { title: "common.settings", layout: "document" },
      "/tasks": { title: "common.tasks", layout: "workbench" },
    });
  });
});
