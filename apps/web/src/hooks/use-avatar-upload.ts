import { orpc } from "@raypx/api/orpc";
import { useAuth } from "@raypx/auth";
import { toast } from "@raypx/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface UseAvatarUploadOptions {
  /**
   * Callback when upload succeeds
   */
  onSuccess?: () => void;
  /**
   * Callback when upload fails
   */
  onError?: (error: Error) => void;
  /**
   * Image format to use (default: "jpeg")
   */
  format?: "jpeg" | "webp" | "png";
  /**
   * Maximum file size in bytes (default: 5MB)
   */
  maxSize?: number;
}

interface UseAvatarUploadReturn {
  /**
   * Upload a file
   */
  upload: (file: File) => Promise<void>;
  /**
   * Delete the current avatar
   */
  deleteAvatar: () => void;
  /**
   * Whether an upload is in progress
   */
  isUploading: boolean;
  /**
   * Whether a delete is in progress
   */
  isDeleting: boolean;
  /**
   * Whether any operation is in progress
   */
  isLoading: boolean;
}

/**
 * Hook for handling avatar uploads and deletions
 * Provides unified error handling, session refresh, and loading states
 */
export function useAvatarUpload(options: UseAvatarUploadOptions = {}): UseAvatarUploadReturn {
  const { onSuccess, onError, format = "jpeg", maxSize = 5 * 1024 * 1024 } = options;

  const queryClient = useQueryClient();
  const {
    hooks: { useSession },
  } = useAuth();
  const { refetch: refetchSession } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      if (file.size > maxSize) {
        throw new Error(`Image must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", format);

      const response = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error || "Failed to upload avatar");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Avatar uploaded successfully!");
      queryClient.invalidateQueries();
      void refetchSession();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload avatar");
      onError?.(error);
    },
  });

  const deleteMutation = useMutation({
    ...orpc.storage.deleteAvatar.mutationOptions(),
    onSuccess: () => {
      toast.success("Avatar removed successfully!");
      queryClient.invalidateQueries();
      void refetchSession();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove avatar");
    },
  });

  const upload = async (file: File) => {
    setIsProcessing(true);
    try {
      await uploadMutation.mutateAsync(file);
    } catch {
      // Error already handled in mutation
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteAvatar = () => {
    deleteMutation.mutate();
  };

  return {
    upload,
    deleteAvatar,
    isUploading: uploadMutation.isPending || isProcessing,
    isDeleting: deleteMutation.isPending,
    isLoading: uploadMutation.isPending || deleteMutation.isPending || isProcessing,
  };
}
