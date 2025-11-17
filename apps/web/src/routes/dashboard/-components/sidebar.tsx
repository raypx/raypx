import type { AuthUser } from "@raypx/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Badge } from "@raypx/ui/components/badge";
import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { Separator } from "@raypx/ui/components/separator";
import { cn } from "@raypx/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { BookOpen, FileText, Home, Key, Settings, Shield, User, Users } from "lucide-react";
import { Logo } from "@/components/layout/logo";

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

interface AppSidebarProps {
  user: AuthUser;
}

const userMenuItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "Profile",
    href: "/dashboard/profile",
    icon: User,
  },
  {
    title: "Knowledge Bases",
    href: "/dashboard/knowledges",
    icon: BookOpen,
  },
  {
    title: "Documents",
    href: "/dashboard/documents",
    icon: FileText,
  },
  {
    title: "API Keys",
    href: "/dashboard/api-keys",
    icon: Key,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

const adminMenuItems = [
  {
    title: "Users",
    href: "/dashboard/users",
    icon: Users,
  },
];

function isAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

function isActivePath(currentPath: string, href: string): boolean {
  // Exact match for dashboard root
  if (href === "/dashboard") {
    return currentPath === "/dashboard";
  }
  // For other paths, check if current path starts with the href
  return currentPath.startsWith(href);
}

export function AppSidebar({ user }: AppSidebarProps) {
  const showAdminMenu = isAdmin(user?.role);
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <aside className="w-64 border-r bg-card flex flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <Link className="flex items-center gap-2 font-semibold" to="/">
          <Logo className="size-6" />
          <span>Raypx</span>
        </Link>
      </div>

      {/* User Info */}
      <div className="px-4 py-3 border-b">
        <Link
          className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
          to="/dashboard/profile"
        >
          <Avatar className="size-8">
            {user?.image && <AvatarImage alt={user?.name || user?.email || ""} src={user.image} />}
            <AvatarFallback className="text-xs">
              {getUserInitials(user?.name, user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email && user?.name ? user.email : "Personal"}
            </p>
          </div>
        </Link>
        {/* TODO: Add organization switcher here */}
        {/* <OrganizationSwitcher /> */}
      </div>

      <ScrollArea className="flex-1 p-4">
        {/* User Menu */}
        <nav className="space-y-1">
          {userMenuItems.map((item) => {
            const isActive = isActivePath(currentPath, item.href);
            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                )}
                key={item.href}
                to={item.href}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Admin Menu */}
        {showAdminMenu && (
          <>
            <Separator className="my-4" />
            <div className="mb-2 px-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Admin
                </h3>
                <Badge className="h-5 text-[10px]" variant="destructive">
                  <Shield className="h-3 w-3 mr-1" />
                  Admin
                </Badge>
              </div>
            </div>
            <nav className="space-y-1">
              {adminMenuItems.map((item) => {
                const isActive = isActivePath(currentPath, item.href);
                return (
                  <Link
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground",
                    )}
                    key={item.href}
                    to={item.href}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </ScrollArea>
    </aside>
  );
}
