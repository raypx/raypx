import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { Switch } from "@raypx/ui/components/switch";
import { Clock, Key, Shield, Smartphone } from "lucide-react";

export function SecuritySettings() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              placeholder="Enter your current password"
              type="password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" placeholder="Enter your new password" type="password" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input id="confirm-password" placeholder="Confirm your new password" type="password" />
          </div>

          <Button>Update Password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                <span className="font-medium">Authenticator App</span>
                <Badge variant="secondary">Not Enabled</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Use an authenticator app to generate one-time codes
              </p>
            </div>
            <Button variant="outline">Enable</Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="font-medium">Backup Codes</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Generate backup codes for account recovery
              </p>
            </div>
            <Button variant="outline">Generate</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Manage your API keys for programmatic access</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                <span className="font-medium">Manage API Keys</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Create and manage API keys for development
              </p>
            </div>
            <Button asChild variant="outline">
              <a href="/api-keys">View API Keys</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Manage your active sessions across devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Current Session</span>
                  <Badge variant="default">Active</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Chrome on macOS • Last active: Now</p>
              </div>
              <Button disabled size="sm" variant="ghost">
                Current
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Mobile Session</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Safari on iPhone • Last active: 2 hours ago
                </p>
              </div>
              <Button size="sm" variant="ghost">
                Revoke
              </Button>
            </div>
          </div>

          <Button className="w-full" variant="destructive">
            Sign Out All Devices
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
