import type { AuthUser } from "@raypx/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  Sidebar as UiSidebar,
} from "@raypx/ui/components/sidebar";
import { cn } from "@raypx/ui/lib/utils";
import { IconSettings } from "@tabler/icons-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Logo } from "~/components/layout/logo";
import { sidebarGroups } from "~/config/sidebar";

/**
 * Get user initials from name or email
 */
function getUserInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      const firstInitial = names[0]?.[0];
      const lastInitial = names[names.length - 1]?.[0];
      if (firstInitial && lastInitial) {
        return `${firstInitial}${lastInitial}`.toUpperCase();
      }
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

interface SidebarProps {
  user: AuthUser;
}

function hasRoleAccess(userRole: string | null | undefined, requiredRoles?: string[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true; // No role restriction, all users can access
  }
  if (!userRole) {
    return false; // User has no role, but roles are required
  }
  return requiredRoles.includes(userRole);
}

function isActivePath(currentPath: string, href: string): boolean {
  // Exact match for dashboard root
  if (href === "/dashboard") {
    return currentPath === "/dashboard";
  }
  // For other paths, check if current path starts with the href
  return currentPath.startsWith(href);
}

export function Sidebar({ user }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <UiSidebar className="border-r-0 bg-card/50 backdrop-blur-xl" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Logo className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Raypx</span>
                  <span className="text-xs text-muted-foreground">v1.0.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {Object.entries(sidebarGroups).map(([key, group]) => {
          // Check if user has required role to see this group
          if (!hasRoleAccess(user?.role, group.role)) {
            return null;
          }

          return (
            <SidebarGroup key={key}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = isActivePath(currentPath, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => {
                            navigate({ to: item.href });
                          }}
                        >
                          <item.icon className={cn(isActive && "text-primary")} />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-12"
              size="lg"
            >
              <Link to="/dashboard/settings">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user?.image && (
                    <AvatarImage alt={user?.name || user?.email || ""} src={user.image} />
                  )}
                  <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-medium">
                    {getUserInitials(user?.name, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.name || user?.email}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email && user?.name ? user.email : "Personal Plan"}
                  </span>
                </div>
                <IconSettings className="ml-auto size-4" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </UiSidebar>
  );
}
