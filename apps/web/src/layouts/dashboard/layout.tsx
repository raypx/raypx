"use client";

import type { AuthUser } from "@raypx/auth";
import { cn } from "@raypx/ui/lib/utils";
import { SidebarInset, SidebarProvider } from "@raypx/ui/components/sidebar";
import { Outlet } from "@tanstack/react-router";
import { SearchProvider } from "~/components/search-provider";
import { Sidebar } from "./sidebar";

interface LayoutProps {
  user: AuthUser;
}

export function Layout({ user }: LayoutProps) {
  return (
    <div className="border-grid flex flex-1 flex-col">
      <SearchProvider>
        <SidebarProvider>
          {/* Sidebar */}
          <Sidebar user={user} />

          {/* Main content */}
          <SidebarInset>
            <div
              id="content"
              className={cn(
                "flex h-full w-full flex-col",
                "has-[div[data-layout=fixed]]:h-svh",
                "group-data-[scroll-locked=1]/body:h-full",
                "has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh"
              )}
            >
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </SearchProvider>
    </div>
  );
}
