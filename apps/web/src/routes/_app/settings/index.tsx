import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "./-components/account-settings";
import { PreferencesSettings } from "./-components/preferences-settings";
import { SecuritySettings } from "./-components/security-settings";

export const Route = createFileRoute("/_app/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Tabs className="space-y-4" defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="account">
          <AccountSettings />
        </TabsContent>

        <TabsContent className="space-y-4" value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent className="space-y-4" value="preferences">
          <PreferencesSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
