import { ScrollArea } from "@raypx/ui/components/scroll-area";
import { cn } from "@raypx/ui/lib/utils";
import { Link, useParams } from "@tanstack/react-router";
import { BarChart, Building2, CreditCard, Settings, Users } from "lucide-react";

export function OrgSidebar() {
  const params = useParams({ from: "/_org" });
  const orgSlug = "orgSlug" in params ? params.orgSlug : "";

  const orgMenuItems = [
    {
      title: "Overview",
      href: `/org/${orgSlug}`,
      icon: Building2,
    },
    {
      title: "Members",
      href: `/org/${orgSlug}/members`,
      icon: Users,
    },
    {
      title: "Analytics",
      href: `/org/${orgSlug}/analytics`,
      icon: BarChart,
    },
    {
      title: "Billing",
      href: `/org/${orgSlug}/billing`,
      icon: CreditCard,
    },
    {
      title: "Settings",
      href: `/org/${orgSlug}/settings`,
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 border-r bg-card">
      <div className="flex h-16 items-center px-4 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          <div>
            <p className="font-semibold text-sm">{orgSlug}</p>
            <p className="text-xs text-muted-foreground">Organization</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <nav className="space-y-1">
          {orgMenuItems.map((item) => (
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
      </ScrollArea>
    </aside>
  );
}
