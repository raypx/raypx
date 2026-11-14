import { BrowserLanguageProvider } from "../../tests/i18n.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppShell,
  ShellSidebarHeader,
  ShellPrimaryAction,
  type ShellAction,
  type ShellLinkProps,
} from "./shell.js";

type Path = "/" | "/agents" | "/settings";

function TestLink({ to, markActive, exact: _exact, children, ...props }: ShellLinkProps<Path>) {
  return (
    <a href={to} {...(markActive && to === "/agents" ? { "aria-current": "page" } : {})} {...props}>
      {children}
    </a>
  );
}

function renderShell(frame?: "document" | "window", actions?: ShellAction[]) {
  return render(
    <BrowserLanguageProvider>
      <AppShell<Path>
        {...(frame ? { frame } : {})}
        {...(actions ? { actions } : {})}
        brand={{ to: "/", label: "Acme" }}
        navigation={[
          [{ to: "/", label: "Account", icon: <svg />, exact: true }],
          [
            { to: "/agents", label: "Agents", icon: <svg />, badge: <span>3</span> },
            { to: "/settings", label: "Settings", icon: <svg /> },
          ],
        ]}
        breadcrumbs={["Acme", "Agents"]}
        layout="workbench"
        notice={<p role="alert">Offline</p>}
        account={<button type="button">Menu</button>}
        LinkComponent={TestLink}
      >
        <ShellSidebarHeader>
          <button type="button">Space: Product</button>
        </ShellSidebarHeader>
        <ShellPrimaryAction>
          <button type="button">New Agent</button>
        </ShellPrimaryAction>
        <p>Content</p>
      </AppShell>
    </BrowserLanguageProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

describe("AppShell", () => {
  it("composes navigation, account, breadcrumbs, notice and main content", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Skip navigation" }).getAttribute("href")).toBe(
      "#main",
    );
    const navigation = screen.getByRole("navigation", { name: "Acme" });
    expect([...navigation.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/agents",
      "/settings",
    ]);
    expect(screen.getByRole("link", { name: /Agents/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Acme" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(screen.getByRole("banner").textContent).toBe("Acme/Agents");
    expect(screen.getByRole("alert").textContent).toBe("Offline");
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    expect(main.textContent).toBe("Content");
    // Templates and notices size against the content column, not the viewport.
    expect(main.parentElement?.className).toContain("@container/main");
    expect(main.firstElementChild?.getAttribute("data-layout")).toBe("workbench");
  });

  it("scrolls only main content inside a native window", () => {
    renderShell("window");
    expect(screen.getByRole("main").className).toContain("overflow-auto");
    expect(screen.getByRole("banner").className).toContain("[--app-region:drag]");
  });

  it("keeps the native brand and commands together without a duplicate sidebar row", () => {
    const onSearch = vi.fn();
    renderShell("window", [
      {
        label: "Search",
        icon: <svg />,
        shortcut: { label: "⌘K", keys: "Meta+K" },
        onSelect: onSearch,
      },
      {
        label: "Create another Agent",
        icon: <svg />,
        render: <a href="/agents" aria-label="Create another Agent" />,
      },
    ]);
    const header = within(screen.getByRole("banner"));
    fireEvent.click(header.getByRole("button", { name: "Collapse sidebar" }));
    expect(header.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    const sidebar = within(screen.getByRole("complementary"));
    const search = header.getByRole("button", { name: "Search" });
    expect(header.getByRole("link", { name: "Acme" })).toBeTruthy();
    expect(sidebar.queryByRole("link", { name: "Acme" })).toBeNull();
    expect(sidebar.queryByRole("button", { name: "Search" })).toBeNull();
    expect(search.getAttribute("aria-keyshortcuts")).toBe("Meta+K");
    fireEvent.click(search);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(header.getByRole("link", { name: "Create another Agent" }).getAttribute("href")).toBe(
      "/agents",
    );
  });

  it("keeps document commands under the sidebar brand", () => {
    renderShell("document", [{ label: "Search", icon: <svg />, onSelect: vi.fn() }]);
    expect(
      within(screen.getByRole("complementary")).getByRole("button", { name: "Search" }),
    ).toBeTruthy();
    expect(within(screen.getByRole("banner")).queryByRole("button", { name: "Search" })).toBe(null);
  });

  it.each(["document", "window"] as const)(
    "keeps one Space control and primary Agent action in the %s sidebar header",
    (frame) => {
      renderShell(frame);
      const sidebar = within(screen.getByRole("complementary"));
      expect(sidebar.getByRole("button", { name: "Space: Product" })).toBeTruthy();
      expect(sidebar.getByRole("button", { name: "New Agent" })).toBeTruthy();
      expect(screen.getAllByRole("button", { name: "Space: Product" })).toHaveLength(1);
      expect(within(screen.getByRole("main")).queryByRole("button")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(sidebar.getByRole("button", { name: "Space: Product" })).toBeTruthy();
      expect(sidebar.getByRole("button", { name: "New Agent" })).toBeTruthy();
    },
  );

  it("keeps feature controls available outside an application shell", () => {
    render(
      <>
        <ShellSidebarHeader>
          <button type="button">Space</button>
        </ShellSidebarHeader>
        <ShellPrimaryAction>
          <button type="button">New Agent</button>
        </ShellPrimaryAction>
      </>,
    );
    expect(screen.getByRole("button", { name: "Space" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Agent" })).toBeTruthy();
  });

  it("toggles the sidebar without removing navigation names, selection or badges", () => {
    renderShell();
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(collapse.getAttribute("aria-controls")!)).toBeTruthy();
    fireEvent.click(collapse);
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("link", { name: /Agents/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.click(expand);
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
  it("supports the sidebar shortcut without intercepting text editing", () => {
    renderShell();
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }).getAttribute("aria-expanded"),
    ).toBe("false");
    const editor = document.createElement("textarea");
    document.body.append(editor);
    fireEvent.keyDown(editor, { key: "b", ctrlKey: true });
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }).getAttribute("aria-expanded"),
    ).toBe("false");
    editor.remove();
  });
  it("restores the collapsed preference after remount and follows changes from another window", () => {
    const view = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("raypx_sidebar_open")).toBe("false");
    view.unmount();
    renderShell();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    localStorage.setItem("raypx_sidebar_open", "true");
    fireEvent(window, new StorageEvent("storage", { key: "raypx_sidebar_open" }));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
  });
});
