import type { AuthUser } from "@raypx/auth";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { Separator } from "@raypx/ui/components/separator";
import { cn } from "@raypx/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Home, Key, LogOut, Settings, Shield, Users } from "lucide-react";
import { Logo } from "@/components/layout/logo";

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
    title: "API Keys",
    href: "/api-keys",
    icon: Key,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

const adminMenuItems = [
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
  },
];

function isAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function AppSidebar({ user }: AppSidebarProps) {
  const showAdminMenu = isAdmin(user?.role);

  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <Link className="flex items-center gap-2 font-semibold" to="/">
          <Logo className="size-6" />
          <span>Raypx</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 p-4">
        {/* User Menu */}
        <nav className="space-y-1">
          {userMenuItems.map((item) => (
            <Link
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "data-[status=active]:bg-accent data-[status=active]:text-accent-foreground",
              )}
              key={item.href}
              to={item.href}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          ))}
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
              {adminMenuItems.map((item) => (
                <Link
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "data-[status=active]:bg-accent data-[status=active]:text-accent-foreground",
                  )}
                  key={item.href}
                  to={item.href}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              ))}
            </nav>
          </>
        )}

        {/* User Info & Sign Out */}
        <div className="mt-6 pt-4 border-t">
          <div className="px-3 py-2 text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            {user?.role && (
              <p className="text-xs text-muted-foreground mt-1">
                Role: <span className="font-medium">{user.role}</span>
              </p>
            )}
          </div>

          <Button asChild className="w-full justify-start gap-3" variant="ghost">
            <Link to="/sign-out">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Link>
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}
