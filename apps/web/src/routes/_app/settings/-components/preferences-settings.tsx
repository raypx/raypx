import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Label } from "@raypx/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { Switch } from "@raypx/ui/components/switch";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { Bell, Globe, Mail, Moon, Sun } from "lucide-react";

export function PreferencesSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the application looks and feels</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <RadioGroup onValueChange={setTheme} value={theme}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="light" value="light" />
                <Label className="flex items-center gap-2 font-normal" htmlFor="light">
                  <Sun className="h-4 w-4" />
                  Light
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="dark" value="dark" />
                <Label className="flex items-center gap-2 font-normal" htmlFor="dark">
                  <Moon className="h-4 w-4" />
                  Dark
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="system" value="system" />
                <Label className="flex items-center gap-2 font-normal" htmlFor="system">
                  <Sun className="h-4 w-4" />
                  System
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language & Region</CardTitle>
          <CardDescription>Set your preferred language and regional settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select defaultValue="en" disabled>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    English
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select defaultValue="utc">
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
                <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
                <SelectItem value="cst">CST (Central Standard Time)</SelectItem>
                <SelectItem value="gmt">GMT (Greenwich Mean Time)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Configure how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <Label className="font-medium" htmlFor="push-notifications">
                  Push Notifications
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Receive push notifications in your browser
              </p>
            </div>
            <Switch id="push-notifications" />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <Label className="font-medium" htmlFor="email-notifications">
                  Email Notifications
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">Receive important updates via email</p>
            </div>
            <Switch defaultChecked id="email-notifications" />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-medium" htmlFor="marketing-emails">
                Marketing Emails
              </Label>
              <p className="text-sm text-muted-foreground">Receive news and promotional content</p>
            </div>
            <Switch id="marketing-emails" />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-medium" htmlFor="activity-notifications">
                Activity Notifications
              </Label>
              <p className="text-sm text-muted-foreground">Get notified about account activity</p>
            </div>
            <Switch defaultChecked id="activity-notifications" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & Privacy</CardTitle>
          <CardDescription>Control your data and privacy settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-medium" htmlFor="analytics">
                Analytics
              </Label>
              <p className="text-sm text-muted-foreground">
                Help us improve by sharing anonymous usage data
              </p>
            </div>
            <Switch defaultChecked id="analytics" />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="font-medium" htmlFor="personalization">
                Personalization
              </Label>
              <p className="text-sm text-muted-foreground">
                Personalize your experience based on your activity
              </p>
            </div>
            <Switch defaultChecked id="personalization" />
          </div>

          <div className="pt-4">
            <Button variant="outline">Download My Data</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
