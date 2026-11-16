/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Sidebar, SidebarProvider, useSidebar } from "./components/ui/sidebar.js";

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

it("delegates mobile sheet state to its owning store", () => {
  const onOpenMobileChange = vi.fn();
  function Controls() {
    const { openMobile, setOpenMobile } = useSidebar();
    return <button onClick={() => setOpenMobile(!openMobile)}>{String(openMobile)}</button>;
  }
  render(
    <SidebarProvider openMobile={false} onOpenMobileChange={onOpenMobileChange}>
      <Controls />
    </SidebarProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "false" }));
  expect(onOpenMobileChange).toHaveBeenCalledWith(true);
  expect(screen.getByRole("button", { name: "false" })).toBeInTheDocument();
});
