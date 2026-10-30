import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import { DevtoolsBridge } from "../../src/client";
import { panelStore } from "../../src/runtime";
import setupRenderer from "../../src/renderer";
import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

afterEach(() => {
  cleanup();
  panelStore.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function mount() {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queries}>
        <ThemeProvider storageKey={false}>
          <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
            <DevtoolsBridge surface="desktop" stylesheetUrl="/test.css" />
          </BrowserLanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    ),
  });
  const child = createRoute({ getParentRoute: () => root, path: "/" });
  const router = createRouter({
    routeTree: root.addChildren([child]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const target = document.createElement("div");
  document.body.append(target);
  panelStore.mount(target);
  const view = render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  await view.findByText("Raypx page diagnostics");
  return { view, queries, target };
}
it("copies a fresh safe snapshot and updates the query view", async () => {
  const writeText = vi.fn(async (_value: string) => {});
  vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
  const { view, queries } = await mount();
  act(() => {
    queries.setQueryData(["account"], { secret: "private-response" });
  });
  fireEvent.click(view.getByRole("tab", { name: "Query cache (1)" }));
  expect(await view.findByText("account")).toBeTruthy();
  fireEvent.click(view.getByRole("button", { name: "Copy diagnostic snapshot" }));
  await view.findByText("Snapshot copied");
  const snapshot = JSON.parse(writeText.mock.calls[0]![0]);
  expect(snapshot.surface).toBe("desktop");
  expect(snapshot.queries).toHaveLength(1);
  expect(writeText.mock.calls[0]![0]).not.toContain("private-response");
  act(() => {
    queries.clear();
  });
  await view.findByText("No queries are cached on this page.");
});
it("selects JSON for manual copy when Clipboard rejects and never claims success", async () => {
  const writeText = vi.fn(async () => {
    throw new Error("private-clipboard-error");
  });
  vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
  const { view } = await mount();
  fireEvent.click(view.getByRole("button", { name: "Copy diagnostic snapshot" }));
  const textarea = (await view.findByRole("textbox", {
    name: "Diagnostic snapshot JSON",
  })) as HTMLTextAreaElement;
  expect(JSON.parse(textarea.value).schemaVersion).toBe(1);
  expect(textarea.selectionEnd).toBe(textarea.value.length);
  expect(view.queryByText("Snapshot copied")).toBeNull();
  expect(document.body.textContent).not.toContain("private-clipboard-error");
});
it("keeps one embedded script and cleans the portal across Dock activation and unmount", async () => {
  const { view, target } = await mount();
  expect(document.querySelectorAll("script[data-raypx-devtools-client]")).toHaveLength(1);
  act(() => panelStore.deactivate());
  await waitFor(() => expect(target.childElementCount).toBe(0));
  act(() => panelStore.activate());
  await view.findByText("Raypx page diagnostics");
  view.unmount();
  expect(target.childElementCount).toBe(0);
});
it("registers the official renderer lifecycle with an isolated style root", () => {
  const handlers = new Map<string, (value?: HTMLElement) => void>();
  setupRenderer({
    current: {
      domElements: {},
      events: {
        on: (event: string, handler: (value?: HTMLElement) => void) => handlers.set(event, handler),
      },
    },
  } as unknown as DockClientScriptContext);
  const panel = document.createElement("div");
  handlers.get("dom:panel:mounted")!(panel);
  expect(panel.firstElementChild?.shadowRoot?.textContent).toContain("Waiting for page state");
  expect(panelStore.getSnapshot()).not.toBeNull();
  handlers.get("entry:deactivated")!();
  expect(panelStore.getSnapshot()).toBeNull();
  handlers.get("entry:activated")!();
  expect(panelStore.getSnapshot()).not.toBeNull();
});

it("mounts an existing Dock container when the renderer finishes loading late", () => {
  const panel = document.createElement("div");
  setupRenderer({
    current: { domElements: { panel }, events: { on: () => () => {} } },
  } as unknown as DockClientScriptContext);
  expect(panel.firstElementChild?.shadowRoot?.textContent).toContain("Waiting for page state");
  expect(panelStore.getSnapshot()).not.toBeNull();
  panelStore.clear();
  expect(panelStore.getSnapshot()).toBeNull();
});
