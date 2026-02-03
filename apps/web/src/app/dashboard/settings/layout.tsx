"use client";

import { cn } from "@raypx/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { title: "Profile", href: "/dashboard/settings/profile" },
  { title: "Organization", href: "/dashboard/settings/organization" },
  { title: "Billing", href: "/dashboard/settings/billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
              pathname === tab.href && "border-primary text-foreground",
            )}
            href={tab.href}
            key={tab.href}
          >
            {tab.title}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
