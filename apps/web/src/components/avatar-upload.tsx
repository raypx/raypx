import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import { IconCamera, IconLoader2, IconTrash, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useAvatarUpload } from "../hooks/use-avatar-upload";

interface AvatarUploadProps {
  userId: string;
  currentAvatar?: string | null;
  userName?: string | null;
}

export function AvatarUpload({ currentAvatar, userName }: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { upload, deleteAvatar, isLoading } = useAvatarUpload({
    onSuccess: () => {
      setPreview(null);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);

    await upload(file);
  };

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to remove your avatar?")) {
      return;
    }
    deleteAvatar();
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

  const displayAvatar = preview || currentAvatar;

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <Avatar className="h-24 w-24">
          <AvatarImage alt={userName || "User"} src={displayAvatar || undefined} />
          <AvatarFallback className="text-2xl">{getInitials(userName)}</AvatarFallback>
        </Avatar>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80">
            <IconLoader2 className="h-6 w-6 animate-spin" />
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
                <IconCamera className="h-4 w-4" />
                Change Picture
              </>
            ) : (
              <>
                <IconUpload className="h-4 w-4" />
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
              <IconTrash className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
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
