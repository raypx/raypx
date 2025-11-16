import type { AuthUser } from "@raypx/auth";
import { Button } from "@raypx/ui/components/button";
import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { cn } from "@raypx/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Home, Key, LogOut, Settings } from "lucide-react";
import { Logo } from "@/components/layout/logo";

interface AppSidebarProps {
  user: AuthUser;
}

const menuItems = [
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

export function AppSidebar({ user }: AppSidebarProps) {
  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <Link className="flex items-center gap-2 font-semibold" to="/">
          <Logo className="size-6" />
          <span>Raypx</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 p-4">
        <nav className="space-y-1">
          {menuItems.map((item) => (
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

        <div className="mt-auto pt-4 border-t">
          <div className="px-3 py-2 text-sm">
            <p className="font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
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
