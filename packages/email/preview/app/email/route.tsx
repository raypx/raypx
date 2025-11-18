import { Separator } from "@raypx/ui/components/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@raypx/ui/components/sidebar";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../../components/sidebar";

/**
 * Layout route for email preview pages
 * Provides the sidebar and main content area structure
 */
export const Route = createFileRoute("/email")({
  component: EmailLayout,
});

function EmailLayout() {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator className="mr-2 h-4" orientation="vertical" />
          </div>
        </header>
        <main className="flex-1 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
