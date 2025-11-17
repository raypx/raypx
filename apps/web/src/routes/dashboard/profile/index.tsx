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
import { Textarea } from "@raypx/ui/components/textarea";
import { toast } from "@raypx/ui/components/toast";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Mail, User } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/profile/")({
  component: ProfilePage,
});

function ProfilePage() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Profile updated successfully!");
  };

  const handleAvatarUpload = () => {
    // TODO: Implement avatar upload
    toast.info("Avatar upload coming soon!");
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your personal profile and public information</p>
      </div>

      {/* Avatar Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            Profile Picture
          </CardTitle>
          <CardDescription>Update your profile picture and avatar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage alt={user?.name || "User"} src={user?.image || undefined} />
              <AvatarFallback className="text-2xl">{getInitials(user?.name)}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button className="gap-2" onClick={handleAvatarUpload} variant="outline">
                <Camera className="h-4 w-4" />
                Upload New Picture
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or GIF. Max size 2MB. Recommended: 400x400px
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            Personal Information
          </CardTitle>
          <CardDescription>Update your personal details and bio</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveProfile();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  value={name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  disabled
                  id="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  type="email"
                  value={email}
                />
                <p className="text-xs text-muted-foreground">
                  Email changes require verification and must be done through security settings
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                className="min-h-24"
                id="bio"
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                value={bio}
              />
              <p className="text-xs text-muted-foreground">
                Brief description for your profile. Max 160 characters.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                onClick={() => {
                  setName(user?.name || "");
                  setEmail(user?.email || "");
                  setBio("");
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>View your account details and metadata</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">User ID</p>
              <p className="text-sm font-mono">{user?.id || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Account Role</p>
              <p className="text-sm capitalize">{user?.role || "user"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Email Verified</p>
              <p className="text-sm">{user?.emailVerified ? "Yes" : "No"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Account Created</p>
              <p className="text-sm">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
