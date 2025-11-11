import { Button } from "@raypx/ui/components/button";
import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { cn } from "@raypx/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Database,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
} from "lucide-react";

const adminMenuItems = [
  {
    title: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Organizations",
    href: "/admin/organizations",
    icon: Building2,
  },
  {
    title: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "Database",
    href: "/admin/database",
    icon: Database,
  },
  {
    title: "System",
    href: "/admin/system",
    icon: Settings,
  },
];

export function AdminSidebar() {
  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <Link className="flex items-center gap-2 font-semibold" to="/admin">
          <Shield className="h-6 w-6 text-primary" />
          <span>Admin Panel</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 p-4">
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

        <div className="mt-6 pt-4 border-t">
          <Button asChild className="w-full justify-start gap-3" variant="outline">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Link>
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}
