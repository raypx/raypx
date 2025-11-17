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
import { useToast } from "@raypx/ui/hooks/use-toast";
import { Clock, Key, Shield, Smartphone } from "lucide-react";
import { useState } from "react";

export function SecuritySettings() {
  const { toast } = useToast();
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [enabling2FA, setEnabling2FA] = useState(false);
  const [generatingBackup, setGeneratingBackup] = useState(false);
  const [revokingSession, setRevokingSession] = useState(false);

  const handlePasswordUpdate = async () => {
    setIsUpdatingPassword(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Password updated",
      description: "Your password has been updated successfully.",
      duration: 5000,
    });
    setIsUpdatingPassword(false);
  };

  const handleEnable2FA = async () => {
    setEnabling2FA(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "2FA Setup Initiated",
      description: "Please scan the QR code with your authenticator app.",
    });
    setEnabling2FA(false);
  };

  const handleGenerateBackup = async () => {
    setGeneratingBackup(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Backup Codes Generated",
      description: "Save these codes in a secure location.",
    });
    setGeneratingBackup(false);
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    toast({
      title: "Session Revoked",
      description: "The session has been terminated.",
    });
    setRevokingSession(false);
  };

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

          <Button disabled={isUpdatingPassword} onClick={handlePasswordUpdate}>
            {isUpdatingPassword ? "Updating..." : "Update Password"}
          </Button>
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
            <Button disabled={enabling2FA} onClick={handleEnable2FA} variant="outline">
              {enabling2FA ? "Setting up..." : "Enable"}
            </Button>
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
            <Button disabled={generatingBackup} onClick={handleGenerateBackup} variant="outline">
              {generatingBackup ? "Generating..." : "Generate"}
            </Button>
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
              <a href="/dashboard/api-keys">View API Keys</a>
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
