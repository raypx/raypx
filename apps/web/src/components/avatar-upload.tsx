import { useTRPC } from "@raypx/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import { toast } from "@raypx/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

interface AvatarUploadProps {
  userId: string;
  currentAvatar?: string | null;
  userName?: string | null;
}

export function AvatarUpload({ userId, currentAvatar, userName }: AvatarUploadProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Upload mutation
  const uploadMutation = useMutation({
    ...trpc.storage.uploadAvatar.mutationOptions(),
    onSuccess: (data) => {
      toast.success("Avatar uploaded successfully!");
      setPreview(null);
      // Invalidate session to refresh avatar
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload avatar");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...trpc.storage.deleteAvatar.mutationOptions(),
    onSuccess: () => {
      toast.success("Avatar removed successfully!");
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove avatar");
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsProcessing(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPreview(dataUrl);
      };
      reader.readAsDataURL(file);

      // Convert to base64 for upload
      const base64 = await fileToBase64(file);

      // Upload
      await uploadMutation.mutateAsync({
        image: base64,
        format: "webp", // Always convert to WebP for optimization
      });
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to remove your avatar?")) {
      return;
    }
    deleteMutation.mutate();
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

  const isLoading = uploadMutation.isPending || deleteMutation.isPending || isProcessing;
  const displayAvatar = preview || currentAvatar;

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <Avatar className="h-24 w-24">
          <AvatarImage alt={userName || "User"} src={displayAvatar || undefined} />
          <AvatarFallback className="text-2xl">{getInitials(userName)}</AvatarFallback>
        </Avatar>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            className="gap-2"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            variant="outline"
          >
            {currentAvatar ? (
              <>
                <Camera className="h-4 w-4" />
                Change Picture
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Picture
              </>
            )}
          </Button>

          {currentAvatar && (
            <Button
              className="gap-2"
              disabled={isLoading}
              onClick={handleDelete}
              size="sm"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          JPG, PNG, GIF or WebP. Max 5MB.
          <br />
          Will be resized to 256x256 and optimized.
        </p>

        <input
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          ref={fileInputRef}
          type="file"
        />
      </div>
    </div>
  );
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
