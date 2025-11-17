import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/tabs";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { Settings, Shield, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AccountSettings } from "./-components/account-settings";
import { PreferencesSettings } from "./-components/preferences-settings";
import { SecuritySettings } from "./-components/security-settings";

export const Route = createFileRoute("/dashboard/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const location = useLocation();
  const getTabFromSearch = (): "account" | "security" | "preferences" => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "security" || tab === "preferences" || tab === "account") return tab;
    return "account";
  };
  const [activeTab, setActiveTab] = useState<"account" | "security" | "preferences">(
    getTabFromSearch(),
  );

  useEffect(() => {
    setActiveTab(getTabFromSearch());
  }, [location.search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Tabs className="space-y-6" onValueChange={(v) => setActiveTab(v as any)} value={activeTab}>
        <TabsList className="w-full grid grid-cols-3 lg:w-auto lg:grid-cols-3 lg:inline-flex">
          <TabsTrigger
            aria-selected={activeTab === "account"}
            className="flex items-center gap-2"
            value="account"
          >
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger
            aria-selected={activeTab === "security"}
            className="flex items-center gap-2"
            value="security"
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger
            aria-selected={activeTab === "preferences"}
            className="flex items-center gap-2"
            value="preferences"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Preferences</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="account">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-muted-foreground" />
                Account Information
              </CardTitle>
              <CardDescription>
                Manage your account profile and personal information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                Security Settings
              </CardTitle>
              <CardDescription>Manage your account security and authentication</CardDescription>
            </CardHeader>
            <CardContent>
              <SecuritySettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                Preferences
              </CardTitle>
              <CardDescription>Customize your application preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <PreferencesSettings />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
