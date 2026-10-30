import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { AppShell, type ShellLinkProps } from "../../src/components/shell";

type Path = "/" | "/tasks" | "/settings";

function TestLink({ to, markActive, exact: _exact, children, ...props }: ShellLinkProps<Path>) {
  return (
    <a href={to} {...(markActive && to === "/tasks" ? { "aria-current": "page" } : {})} {...props}>
      {children}
    </a>
  );
}

function renderShell(frame?: "document" | "window") {
  return render(
    <BrowserLanguageProvider>
      <AppShell<Path>
        {...(frame ? { frame } : {})}
        brand={{ to: "/", label: "Acme" }}
        navigation={[
          [{ to: "/", label: "Account", icon: <svg />, exact: true }],
          [
            { to: "/tasks", label: "Tasks", icon: <svg />, badge: <span>3</span> },
            { to: "/settings", label: "Settings", icon: <svg /> },
          ],
        ]}
        breadcrumbs={["Acme", "Tasks"]}
        layout="workbench"
        notice={<p role="alert">Offline</p>}
        account={<button type="button">Menu</button>}
        LinkComponent={TestLink}
      >
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
      "/tasks",
      "/settings",
    ]);
    expect(screen.getByRole("link", { name: /Tasks/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Acme" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(screen.getByRole("banner").textContent).toBe("Acme/Tasks");
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
    expect(screen.getByRole("banner").className).toContain("[-webkit-app-region:drag]");
  });

  it("toggles the sidebar without removing navigation names, selection or badges", () => {
    renderShell();
    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(collapse.getAttribute("aria-controls")!)).toBeTruthy();
    fireEvent.click(collapse);
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("link", { name: /Tasks/ }).getAttribute("aria-current")).toBe("page");
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
