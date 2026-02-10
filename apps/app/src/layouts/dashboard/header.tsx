import { UserButton } from "@raypx/auth";
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
import { IconBell } from "@tabler/icons-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { authRoutes } from "~/config/auth";
import { sidebarGroups } from "~/config/sidebar";
import { CommandMenu } from "./command-menu";

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

export function Header() {
  const location = useLocation();
  const breadcrumbs = useMemo(() => generateBreadcrumbs(location.pathname), [location.pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur-md transition-all">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator className="hidden h-4 md:block" orientation="vertical" />

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
                        <BreadcrumbLink>
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

        <Separator className="hidden h-4 md:block" orientation="vertical" />
        <CommandMenu />
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Theme Toggle */}
        <ThemeSwitcher mode="light-dark" />

        {/* Notifications */}
        <Button className="relative" size="icon" variant="ghost">
          <IconBell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-background" />
        </Button>

        {/* User menu */}
        <UserButton
          avatar={{ size: "h-9 w-9" }}
          showThemeSwitcher={false}
          signOutPath={authRoutes.signOut}
        />
      </div>
    </header>
  );
}
