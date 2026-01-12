import { cn } from "@raypx/ui/lib/utils";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsLayout,
});

const tabs = [
  { title: "Profile", href: "/dashboard/settings/profile" },
  { title: "Organization", href: "/dashboard/settings/organization" },
  { title: "Billing", href: "/dashboard/settings/billing" },
];

function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-2xl tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and organization settings.</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            className={cn(
              "border-transparent border-b-2 px-4 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground",
              location.pathname === tab.href && "border-primary text-foreground",
            )}
            key={tab.href}
            to={tab.href}
          >
            {tab.title}
          </Link>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
