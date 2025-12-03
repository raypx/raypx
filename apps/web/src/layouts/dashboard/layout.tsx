import type { AuthUser } from "@raypx/auth";
import { Button } from "@raypx/ui/components/button";
import { SidebarInset, SidebarProvider } from "@raypx/ui/components/sidebar";
import { Outlet } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { links } from "~/config/site";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

interface LayoutProps {
  user: AuthUser;
}

export function Layout({ user }: LayoutProps) {
  return (
    <SidebarProvider>
      {/* Sidebar */}
      <Sidebar user={user} />

      {/* Main content */}
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          {/* Header */}
          <Header user={user} />

          {/* Page content */}
          <main className="flex-1 bg-muted/30 relative">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-size-[24px_24px] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,#00000005_0%,transparent_100%)] pointer-events-none" />

            <div className="relative z-10 p-6 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Outlet />
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t bg-background/50 backdrop-blur-sm px-6 py-4 relative z-20">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <Button asChild className="gap-2" size="sm" variant="ghost">
                <a href={links.docs} rel="noopener noreferrer" target="_blank">
                  <HelpCircle className="h-4 w-4" />
                  <span>Help & Support</span>
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Raypx</p>
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
