"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  toast,
} from "@raypx/ui/components";
import { FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { formatFileSize, truncateTextMiddle } from "~/lib/dashboard-utils";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls";

interface DocumentUploadDialogProps {
  datasetId: string;
  datasetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface UploadState {
  files: File[];
  progress: Record<string, number>;
  isUploading: boolean;
}

type UploadAction =
  | { type: "ADD_FILES"; files: File[] }
  | { type: "REMOVE_FILE"; index: number }
  | { type: "UPDATE_PROGRESS"; index: number; progress: number }
  | { type: "SET_UPLOADING"; isUploading: boolean }
  | { type: "RESET" };

const initialState: UploadState = {
  files: [],
  progress: {},
  isUploading: false,
};

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case "ADD_FILES":
      return {
        ...state,
        files: [...state.files, ...action.files],
      };
    case "REMOVE_FILE": {
      const indexStr = action.index.toString();
      const { [indexStr]: _, ...restProgress } = state.progress;
      return {
        ...state,
        files: state.files.filter((_, i) => i !== action.index),
        progress: restProgress,
      };
    }
    case "UPDATE_PROGRESS":
      return {
        ...state,
        progress: {
          ...state.progress,
          [action.index.toString()]: action.progress,
        },
      };
    case "SET_UPLOADING":
      return {
        ...state,
        isUploading: action.isUploading,
        progress: action.isUploading ? {} : state.progress,
      };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export function DocumentUploadDialog({
  datasetId,
  datasetName,
  open,
  onOpenChange,
  onSuccess,
}: DocumentUploadDialogProps) {
  const [uploadState, dispatch] = useReducer(uploadReducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      dispatch({ type: "RESET" });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" exceeds 50MB limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      dispatch({ type: "ADD_FILES", files: validFiles });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    dispatch({ type: "REMOVE_FILE", index });
  }, []);

  const handleUpload = async () => {
    if (uploadState.files.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    dispatch({ type: "SET_UPLOADING", isUploading: true });

    const uploadPromises = uploadState.files.map(async (file, index) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("datasetId", datasetId);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            dispatch({ type: "UPDATE_PROGRESS", index, progress: percentComplete });
          }
        });

        const uploadPromise = new Promise<Response>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, { status: xhr.status }));
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          };
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.open("POST", "/api/upload/document");
          xhr.send(formData);
        });

        const response = await uploadPromise;
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Upload failed");
        }

        dispatch({ type: "UPDATE_PROGRESS", index, progress: 100 });

        return result;
      } catch (error) {
        toast.error(
          `Failed to upload "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        throw error;
      }
    });

    try {
      await Promise.all(uploadPromises);
      toast.success(`Successfully uploaded ${uploadState.files.length} file(s)`);
      dispatch({ type: "RESET" });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // Errors already handled above
    } finally {
      dispatch({ type: "SET_UPLOADING", isUploading: false });
    }
  };

  const handleClose = useCallback(() => {
    if (!uploadState.isUploading) {
      dispatch({ type: "RESET" });
      onOpenChange(false);
    }
  }, [uploadState.isUploading, onOpenChange]);

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload documents to {datasetName}. Supported formats: PDF, DOCX, TXT, MD, etc.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="files">Files</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                id="files"
                multiple
                onChange={handleFileSelect}
                ref={fileInputRef}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <Upload className="h-4 w-4 mr-2" />
                Select Files
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Max 50MB per file. Multiple files supported.
              </p>
            </div>
            {uploadState.files.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-sm font-medium">Selected Files:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {uploadState.files.map((file, index) => {
                    const progress = uploadState.progress[index.toString()];
                    const showProgress = uploadState.isUploading && progress !== undefined;

                    return (
                      <div
                        className="flex items-center gap-3 p-2 bg-muted/50 rounded border"
                        key={`${file.name}-${file.size}-${index}`}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" title={file.name}>
                            {truncateTextMiddle(file.name, 45, 18, 18)}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        {showProgress ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">
                              {Math.round(progress)}%
                            </span>
                          </div>
                        ) : (
                          <Button
                            disabled={uploadState.isUploading}
                            onClick={() => removeFile(index)}
                            size="icon"
                            variant="ghost"
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={uploadState.isUploading}
          >
            Cancel
          </Button>
          <Button
            disabled={uploadState.files.length === 0 || uploadState.isUploading}
            onClick={handleUpload}
          >
            {uploadState.isUploading ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-pulse" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {uploadState.files.length} File{uploadState.files.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

