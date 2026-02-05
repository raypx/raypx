"use client";

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
import { toast } from "@raypx/ui/components/toast";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { rpc } from "@/utils/orpc";

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name || "");
  const [image, _setImage] = useState(user?.image || "");

  const updateUser = useMutation({
    mutationFn: (data: { name?: string; image?: string }) => rpc.users.update(data),
    onSuccess: () => {
      toast.success("Profile updated successfully", {
        description: "Your changes have been saved.",
      });
    },
    onError: (err: Error) => {
      toast.error("Failed to update profile", {
        description: err.message,
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: () => rpc.users.delete(),
    onSuccess: () => {
      toast.success("Account deleted successfully", {
        description: "Your account has been permanently deleted.",
      });
    },
    onError: (err: Error) => {
      toast.error("Failed to delete account", {
        description: err.message,
      });
    },
  });

  const handleSave = () => {
    updateUser.mutate({
      name: name !== user?.name ? name : undefined,
      image: image !== user?.image ? image : undefined,
    });
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This action cannot be undone.",
    );
    if (confirmed) {
      await deleteUser.mutateAsync();
      // Redirect or handle post-deletion
    }
  };

  const isDirty = name !== user?.name || image !== user?.image;
  const isLoading = updateUser.isPending || deleteUser.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Your profile picture will be shown across the platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="size-20">
            <AvatarImage src={image || undefined} />
            <AvatarFallback className="text-2xl">
              {name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <Button size="sm" type="button" variant="outline">
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
              <Input
                disabled={isLoading}
                id="name"
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input defaultValue={user?.email || ""} disabled id="email" type="email" />
              <p className="text-muted-foreground text-xs">Contact support to change your email.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button disabled={!isDirty || isLoading} onClick={handleSave} type="button">
            {isLoading ? "Saving..." : "Save changes"}
          </Button>
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
            <Button type="button" variant="outline">
              Enable
            </Button>
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
            <Button disabled={isLoading} onClick={handleDelete} type="button" variant="destructive">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
