import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/settings/profile")({
  component: ProfileSettings,
});

function ProfileSettings() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Your profile picture will be shown across the platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="size-20">
            <AvatarImage src={user?.image || undefined} />
            <AvatarFallback className="text-2xl">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <Button size="sm" variant="outline">
              Change avatar
            </Button>
            <p className="text-muted-foreground text-xs">JPG, GIF or PNG. Max size 2MB.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your personal details here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input defaultValue={user?.name || ""} id="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input defaultValue={user?.email || ""} disabled id="email" type="email" />
              <p className="text-muted-foreground text-xs">Contact support to change your email.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button>Save changes</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Authenticator App</p>
              <p className="text-muted-foreground text-xs">
                Use an authenticator app to generate one-time codes.
              </p>
            </div>
            <Button variant="outline">Enable</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible and destructive actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Delete Account</p>
              <p className="text-muted-foreground text-xs">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
