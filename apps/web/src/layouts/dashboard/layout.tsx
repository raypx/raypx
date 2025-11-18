import type { AuthUser } from "@raypx/auth";
import { Button } from "@raypx/ui/components/button";
import { Outlet } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { links } from "@/config/site";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

interface LayoutProps {
  user: AuthUser;
}

export function Layout({ user }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Sidebar user={user} />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <Header user={user} />

        {/* Page content */}
        <main className="flex-1 bg-muted/50">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t bg-background px-6 py-4">
          <div className="flex items-center justify-between">
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
    </div>
  );
}
