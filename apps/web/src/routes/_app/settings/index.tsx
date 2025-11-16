import { Card, CardContent } from "@raypx/ui/components/card";
import { CardDescription, CardHeader, CardTitle } from "@raypx/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "./-components/account-settings";
import { PreferencesSettings } from "./-components/preferences-settings";
import { SecuritySettings } from "./-components/security-settings";
import { UserCheck, Shield, Settings } from "lucide-react";

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

      <Tabs className="space-y-6" defaultValue="account">
        <TabsList className="w-full grid grid-cols-3 lg:w-auto lg:grid-cols-3 lg:inline-flex">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Preferences</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-muted-foreground" />
                Account Information
              </CardTitle>
              <CardDescription>Manage your account profile and personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <AccountSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
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

        <TabsContent value="preferences" className="space-y-4">
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
