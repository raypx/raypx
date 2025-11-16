import { useAuth } from "@raypx/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
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
import { Upload, User } from "lucide-react";
import { useState } from "react";

export function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleProfileSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Profile updated",
      description: "Your profile has been updated successfully.",
    });
    setIsSaving(false);
  };

  const handleAvatarClick = async () => {
    // Simulate file upload
    toast({
      title: "Upload started",
      description: "Avatar upload initiated.",
    });
  };

  const userInitials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your account profile information and email address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar Upload */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage alt={user?.name ?? ""} src={user?.image ?? undefined} />
              <AvatarFallback className="text-lg">
                {userInitials ? userInitials : <User className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button
                className="gap-2"
                disabled={isLoading}
                onClick={handleAvatarClick}
                size="sm"
                variant="outline"
              >
                <Upload className="h-4 w-4" />
                Upload new photo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG or GIF. Max size of 2MB.
              </p>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input defaultValue={user?.name ?? ""} id="name" placeholder="Enter your full name" />
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              defaultValue={(user as any)?.username ?? ""}
              id="username"
              placeholder="Enter your username"
            />
            <p className="text-xs text-muted-foreground">This is your public display name.</p>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              defaultValue={user?.email ?? ""}
              id="email"
              placeholder="Enter your email"
              type="email"
            />
            <p className="text-xs text-muted-foreground">
              We'll send a verification email to confirm changes.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button disabled={isSaving} onClick={handleProfileSave}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Delete Account</CardTitle>
          <CardDescription>Permanently delete your account and all associated data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button variant="destructive">Delete Account</Button>
        </CardContent>
      </Card>
    </div>
  );
}
