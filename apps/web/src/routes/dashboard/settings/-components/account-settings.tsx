import { useAuth } from "@raypx/auth";
import { useTRPC } from "@raypx/trpc/client";
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
import { useMutation } from "@tanstack/react-query";
import { Upload, User } from "lucide-react";
import { useRef, useState } from "react";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_BASE64_SIZE = 500 * 1024; // 500KB after base64 encoding (roughly 375KB original)

/**
 * Convert image file to base64 data URI with compression
 */
function imageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      reject(new Error("File must be an image"));
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Check base64 size (base64 is ~33% larger than original)
      const base64Size = result.length;
      if (base64Size > MAX_BASE64_SIZE * 1.33) {
        // Try to compress
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions (max 400x400)
          const maxDimension = 400;
          if (width > height) {
            if (width > maxDimension) {
              height = (height * maxDimension) / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = (width * maxDimension) / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to create canvas context"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          // Convert to JPEG with 0.85 quality for smaller size
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);
          resolve(compressedBase64);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = result;
      } else {
        resolve(result);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function AccountSettings() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session, refetch: refetchSession } = useSession();
  const user = session?.user;
  const { toast } = useToast();
  const trpc = useTRPC();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateProfileMutation = useMutation({
    ...trpc.users.updateProfile.mutationOptions(),
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      void refetchSession();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleProfileSave = async () => {
    setIsSaving(true);
    // TODO: Implement actual profile update
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const base64 = await imageToBase64(file);
      await updateProfileMutation.mutateAsync({ image: base64 });
      toast({
        title: "Avatar updated",
        description: "Your avatar has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload avatar",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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
              <input
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <Button
                className="gap-2"
                disabled={isUploading}
                onClick={handleAvatarClick}
                size="sm"
                variant="outline"
              >
                <Upload className="h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload new photo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG or GIF. Max size of 2MB. Will be compressed to ~400x400px.
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
