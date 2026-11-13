import { BrowserLanguageProvider } from "./i18n.js";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("./features/auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: () => ({ isPending: true, data: null, error: null }) },
}));
import { LandingHome } from "./features/landing/components/home.js";

it("server renders the public Agent introduction before a browser session resolves", async () => {
  const router = createRouter({
    routeTree: createRootRoute({ component: LandingHome }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    isServer: true,
  });
  await router.load();
  const html = renderToString(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  expect(html).toContain("A continuing conversation with your Agents.");
  expect(html).toContain("Conversation example");
  expect(html).toContain('href="/agents"');
  expect(html).toContain('aria-busy="true"');
  for (const retired of ["/projects", "/tasks", "/approvals", "/automations"])
    expect(html).not.toContain(`href="${retired}"`);
});
