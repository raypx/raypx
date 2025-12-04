import { useTRPC } from "@raypx/trpc/client";
import { DataTableColumnHeader, ServerDataTable } from "@raypx/ui/business";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  toast,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  BookOpen,
  CheckCircle,
  ChevronLeft,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Upload as UploadIcon,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate, formatFileSize } from "~/lib/dashboard-utils";

export const Route = createFileRoute("/dashboard/datasets/$id/document")({
  component: DatasetDocumentsPage,
});

function DatasetDocumentsPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();

  // Fetch dataset by ID
  const datasetQuery = useQuery({
    ...trpc.datasets.byId.queryOptions({ id }),
    enabled: !!id,
  });

  const dataset = datasetQuery.data;

  if (datasetQuery.isPending) {
    return (
      <PageWrapper spacing="lg">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  if (datasetQuery.isError || !dataset) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={datasetQuery.error?.message ?? "Dataset not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/datasets" });
          }}
          retrying={datasetQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <DocumentsSection
          dataset={{
            id: dataset.id,
            name: dataset.name,
            description: dataset.description,
            status: dataset.status,
            settings: dataset.settings as Record<string, any> | null,
            userId: dataset.userId,
            createdAt: dataset.createdAt,
            updatedAt: dataset.updatedAt,
          }}
          onBack={() => navigate({ to: "/dashboard/datasets" })}
        />
      </div>
    </PageWrapper>
  );
}

// ==================== Documents Section ====================

type DocumentListItem = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  metadata: Record<string, any> | null;
  datasetId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

type DatasetListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  settings: Record<string, any> | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

function DocumentsSection({ dataset, onBack }: { dataset: DatasetListItem; onBack: () => void }) {
  const trpc = useTRPC();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "status" | "size">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchValue, setSearchValue] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  // Document status options for filter
  const statusOptions = [
    {
      label: "Processing",
      value: "processing",
      icon: Clock,
    },
    {
      label: "Uploaded",
      value: "uploaded",
      icon: UploadIcon,
    },
    {
      label: "Completed",
      value: "completed",
      icon: CheckCircle,
    },
    {
      label: "Failed",
      value: "failed",
      icon: XCircle,
    },
  ];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRows, setSelectedRows] = useState<DocumentListItem[]>([]);

  const documentsQuery = useQuery({
    ...trpc.documents.list.queryOptions(
      {
        datasetId: dataset.id,
        q: searchValue.trim() || undefined,
        sortBy,
        sortOrder,
        status:
          statusFilters.length > 0
            ? (statusFilters as Array<"processing" | "uploaded" | "completed" | "failed">)
            : undefined,
        page,
        pageSize,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, refetch, isFetching } = documentsQuery;

  const documents: DocumentListItem[] = useMemo(
    () => (data?.items ?? []) as DocumentListItem[],
    [data?.items],
  );
  const total = data?.total ?? 0;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const maxSize = 50 * 1024 * 1024; // 50MB
    const validFiles = files.filter((file) => {
      if (file.size > maxSize) {
        toast.error(`File "${file.name}" exceeds 50MB limit`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setUploadingFiles((prev) => [...prev, ...validFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadProgress((prev) => {
      const newProgress = { ...prev };
      delete newProgress[index.toString()];
      return newProgress;
    });
  };

  const handleUpload = async () => {
    if (uploadingFiles.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    setIsUploading(true);
    setUploadProgress({});

    const uploadPromises = uploadingFiles.map(async (file, index) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("datasetId", dataset.id);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setUploadProgress((prev) => ({
              ...prev,
              [index.toString()]: percentComplete,
            }));
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

        setUploadProgress((prev) => ({
          ...prev,
          [index.toString()]: 100,
        }));

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
      toast.success(`Successfully uploaded ${uploadingFiles.length} file(s)`);
      setUploadingFiles([]);
      setUploadProgress({});
      setIsUploadDialogOpen(false);
      void refetch();
    } catch {
      // Errors already handled above
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMutation = useMutation({
    ...trpc.documents.delete.mutationOptions(),
    onSuccess: () => {
      void refetch();
      toast.success("Document deleted successfully!");
      // If current page becomes empty after deletion, go to previous page
      if (documents.length === 1 && page > 1) {
        setPage(page - 1);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    deleteMutation.mutate(id);
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "uploaded":
        return "default"; // Uploaded is also a success state
      case "processing":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "uploaded":
        return "Uploaded";
      case "processing":
        return "Processing";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  const getDocumentUrl = (document: DocumentListItem): string | null => {
    return document.metadata?.storageUrl || null;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (_error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleCopyUrl = (document: DocumentListItem) => {
    const url = getDocumentUrl(document);
    if (url) {
      copyToClipboard(url);
    } else {
      toast.error("Document URL not available");
    }
  };

  const handleOpenUrl = (document: DocumentListItem) => {
    const url = getDocumentUrl(document);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast.error("Document URL not available");
    }
  };

  const columns = useMemo<ColumnDef<DocumentListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        enableSorting: true,
        cell: ({ row }) => {
          const document = row.original;
          const documentUrl = getDocumentUrl(document);
          const hasUrl = !!documentUrl;

          return (
            <div className="flex items-center gap-2">
              {hasUrl ? (
                <button
                  className="font-medium flex-1 text-left hover:text-primary transition-colors flex items-center gap-1.5 group"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenUrl(document);
                  }}
                  type="button"
                >
                  <span>{document.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <div className="font-medium flex-1">{document.name}</div>
              )}
              {hasUrl && (
                <Button
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyUrl(document);
                  }}
                  size="icon"
                  title="Copy URL"
                  variant="ghost"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy URL</span>
                </Button>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "size",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">{formatFileSize(row.original.size)}</div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status) as any}>
            {getStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const document = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    handleDelete(document.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [deleteMutation.isPending, handleDelete, handleCopyUrl, handleOpenUrl],
  );

  const sorting: SortingState = useMemo(
    () => [{ id: sortBy, desc: sortOrder === "desc" }],
    [sortBy, sortOrder],
  );

  const handleSortingChange = (newSorting: SortingState) => {
    if (newSorting.length > 0) {
      const sort = newSorting[0];
      if (sort) {
        setSortBy(sort.id as typeof sortBy);
        setSortOrder(sort.desc ? "desc" : "asc");
        setPage(1);
      }
    }
  };

  const handleResetFilters = () => {
    setSearchValue("");
    setStatusFilters([]);
    setPage(1);
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} size="icon" variant="ghost">
            <ChevronLeft className="size-5" />
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-primary" />
              {dataset.name}
            </CardTitle>
            <CardDescription className="mt-1.5">
              {dataset.description || "Manage documents in this dataset"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <ServerDataTable
          columns={columns}
          data={documents}
          // Pagination
          empty={{
            component: (
              <EmptyState
                actionLabel={
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Documents
                  </>
                }
                description="Upload documents to this dataset"
                icon={FileText}
                onAction={() => setIsUploadDialogOpen(true)}
                title="No Documents"
              />
            ),
          }}
          enableSelection
          enableSorting
          filters={[
            {
              title: "Status",
              options: statusOptions,
              selectedValues: statusFilters,
              onSelectedValuesChange: (values) => {
                setStatusFilters(values);
                setPage(1);
              },
            },
          ]}
          getRowId={(row) => row.id}
          isLoading={isPending}
          manualSorting
          onResetFilters={handleResetFilters}
          onSelectionChange={setSelectedRows}
          onSortingChange={handleSortingChange}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (newPageSize) => {
              setPageSize(newPageSize);
              setPage(1);
            },
          }}
          search={{
            value: searchValue,
            onChange: (value) => {
              setSearchValue(value);
              setPage(1);
            },
            placeholder: "Filter documents...",
          }}
          selectedRows={selectedRows}
          skeletonRows={5}
          sorting={sorting}
          toolbarActions={
            <>
              <Dialog onOpenChange={setIsUploadDialogOpen} open={isUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
                    <Upload className="h-4 w-4" />
                    Upload Documents
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Upload Documents</DialogTitle>
                    <DialogDescription>
                      Upload documents to {dataset.name}. Supported formats: PDF, DOCX, TXT, MD,
                      etc.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="files">Files</Label>
                      <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <input
                          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls"
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
                      {uploadingFiles.length > 0 && (
                        <div className="space-y-2 mt-4">
                          <p className="text-sm font-medium">Selected Files:</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {uploadingFiles.map((file, index) => (
                              <div
                                className="flex items-center justify-between p-2 bg-muted/50 rounded border"
                                key={index}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm truncate">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatFileSize(file.size)}
                                    </p>
                                  </div>
                                </div>
                                {isUploading && uploadProgress[index.toString()] !== undefined ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary transition-all"
                                        style={{
                                          width: `${uploadProgress[index.toString()]}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground w-10 text-right">
                                      {Math.round(uploadProgress[index.toString()] ?? 0)}%
                                    </span>
                                  </div>
                                ) : (
                                  <Button
                                    disabled={isUploading}
                                    onClick={() => removeFile(index)}
                                    size="icon"
                                    variant="ghost"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        setIsUploadDialogOpen(false);
                        setUploadingFiles([]);
                        setUploadProgress({});
                      }}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={uploadingFiles.length === 0 || isUploading}
                      onClick={handleUpload}
                    >
                      {isUploading ? (
                        <>
                          <Upload className="h-4 w-4 mr-2 animate-pulse" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload {uploadingFiles.length > 0 ? `${uploadingFiles.length} ` : ""}
                          File
                          {uploadingFiles.length !== 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                disabled={isFetching}
                onClick={() => {
                  void refetch();
                }}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={cn("h-4 w-4", isFetching ? "animate-spin" : "")} />
              </Button>
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
