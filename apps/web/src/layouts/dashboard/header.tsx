import { type AuthUser, UserButton } from "@raypx/auth";
import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@raypx/ui/components/breadcrumb";
import { Button } from "@raypx/ui/components/button";
import { Separator } from "@raypx/ui/components/separator";
import { SidebarTrigger } from "@raypx/ui/components/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useMemo } from "react";
import { authRoutes } from "~/config/auth";
import { sidebarGroups } from "~/config/sidebar";
import { CommandMenu } from "./command-menu";

interface HeaderProps {
  user: AuthUser;
}

function generateBreadcrumbs(pathname: string) {
  const breadcrumbs: Array<{ label: string; href: string }> = [];

  // Always start with Dashboard
  if (pathname !== "/dashboard") {
    breadcrumbs.push({ label: "Dashboard", href: "/dashboard" });
  }

  // Find matching menu item from sidebar config
  const allMenuItems = Object.values(sidebarGroups).flatMap((group) => group.items);

  const pathSegments = pathname.split("/").filter(Boolean);
  let currentPath = "";

  for (const segment of pathSegments) {
    currentPath += `/${segment}`;
    const menuItem = allMenuItems.find((item) => item.href === currentPath);
    if (menuItem && currentPath !== "/dashboard") {
      breadcrumbs.push({ label: menuItem.title, href: currentPath });
    }
  }

  return breadcrumbs;
}

export function Header({ user }: HeaderProps) {
  const location = useLocation();
  const breadcrumbs = useMemo(() => generateBreadcrumbs(location.pathname), [location.pathname]);

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-background/80 backdrop-blur-md flex items-center justify-between px-4 gap-4 transition-all">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <SidebarTrigger className="-ml-1" />
        <Separator className="h-4 hidden md:block" orientation="vertical" />

        {/* Breadcrumb */}
        {breadcrumbs.length > 0 && (
          <Breadcrumb className="hidden md:flex">
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <div className="flex items-center" key={crumb.href}>
                    {index > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link to={crumb.href}>{crumb.label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </div>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <Separator className="h-4 hidden md:block" orientation="vertical" />
        <CommandMenu />
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Theme Toggle */}
        <ThemeSwitcher mode="light-dark" />

        {/* Notifications */}
        <Button className="relative" size="icon" variant="ghost">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-background" />
        </Button>

        <div className="h-4 w-px bg-border/50 mx-1 hidden md:block" />

        {/* User menu */}
        <UserButton
          avatar={{ size: "h-9 w-9" }}
          showThemeSwitcher={false}
          signOutPath={authRoutes.signOut}
          user={user}
        />
      </div>
    </header>
  );
}
