import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { Settings, Shield, UserCheck } from "lucide-react";
import { AccountSettings } from "./-components/account-settings";
import { PreferencesSettings } from "./-components/preferences-settings";
import { SecuritySettings } from "./-components/security-settings";

export const Route = createFileRoute("/dashboard/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const getTabFromSearch = (): "account" | "security" | "preferences" => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "security" || tab === "preferences" || tab === "account") return tab;
    return "account";
  };

  const activeTab = getTabFromSearch();

  const sidebarNavItems = [
    {
      title: "Account",
      icon: UserCheck,
      value: "account",
      description: "Profile and personal information",
    },
    {
      title: "Security",
      icon: Shield,
      value: "security",
      description: "Password and authentication",
    },
    {
      title: "Preferences",
      icon: Settings,
      value: "preferences",
      description: "App settings and customization",
    },
  ];

  return (
    <div className="space-y-6 pb-16 block">
      <div className="space-y-0.5">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
      </div>
      <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
        <aside className="-mx-4 lg:w-1/5">
          <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
            {sidebarNavItems.map((item) => (
              <button
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 group ${
                  activeTab === item.value
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                key={item.value}
                onClick={() =>
                  navigate({
                    to: "/dashboard/settings",
                    search: { tab: item.value },
                  })
                }
                type="button"
              >
                <item.icon
                  className={`h-4 w-4 transition-colors ${
                    activeTab === item.value
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
                <span className="truncate">{item.title}</span>
                {activeTab === item.value && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse hidden lg:block" />
                )}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 lg:max-w-3xl">
          {activeTab === "account" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Manage your account profile and personal information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AccountSettings />
              </CardContent>
            </Card>
          )}
          {activeTab === "security" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security and authentication</CardDescription>
              </CardHeader>
              <CardContent>
                <SecuritySettings />
              </CardContent>
            </Card>
          )}
          {activeTab === "preferences" && (
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Customize your application preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <PreferencesSettings />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
