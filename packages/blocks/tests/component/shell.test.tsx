import { cleanup, render, screen } from "@testing-library/react";
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
  });

  it("scrolls only main content inside a native window", () => {
    renderShell("window");
    expect(screen.getByRole("main").className).toContain("overflow-auto");
    expect(screen.getByRole("banner").className).toContain("[-webkit-app-region:drag]");
  });
});
