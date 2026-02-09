import { Button } from "@raypx/ui/components/button";
import { SidebarInset, SidebarProvider } from "@raypx/ui/components/sidebar";
import { IconHelpCircle } from "@tabler/icons-react";
import { Outlet } from "@tanstack/react-router";
import { links } from "~/config/site";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function Layout() {
  return (
    <SidebarProvider>
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <SidebarInset>
        <div className="flex min-h-screen flex-col">
          {/* Header */}
          <Header />

          {/* Page content */}
          <main className="relative flex-1 bg-muted/30">
            {/* Background Grid Pattern */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-size-[24px_24px]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,#00000005_0%,transparent_100%)]" />

            <div className="fade-in slide-in-from-bottom-4 relative z-10 mx-auto w-full max-w-8xl animate-in p-6 duration-500 md:p-8">
              <Outlet />
            </div>
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t bg-background/50 px-6 py-4 backdrop-blur-sm">
            <div className="mx-auto flex max-w-8xl items-center justify-between">
              <Button
                className="gap-2"
                render={
                  <a href={links.docs} rel="noopener noreferrer" target="_blank">
                    <IconHelpCircle className="h-4 w-4" />
                    <span>Help & Support</span>
                  </a>
                }
                size="sm"
                variant="ghost"
              />
              <p className="text-muted-foreground text-xs">© {new Date().getFullYear()} Raypx</p>
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
