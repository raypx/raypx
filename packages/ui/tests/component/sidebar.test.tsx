/** @vitest-environment happy-dom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { Sidebar, SidebarProvider } from "../../src/components/ui/sidebar";

afterEach(cleanup);

it("marks rail sidebars so server HTML paints the narrow-screen rail before hydration", () => {
  const { container } = render(
    <SidebarProvider mobileBehavior="rail">
      <Sidebar collapsible="icon">Navigation</Sidebar>
    </SidebarProvider>,
  );
  // Server renders cannot read the viewport; the `sidebar-icon` variant's media rule
  // collapses sidebars carrying this attribute.
  const sidebar = container.querySelector('[data-slot="sidebar"]');
  expect(sidebar?.getAttribute("data-mobile-behavior")).toBe("rail");
});
