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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import {
  IconBook,
  IconBrain,
  IconChevronLeft,
  IconCircleCheck,
  IconClock,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconMessage,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
  IconUpload as UploadIcon,
} from "@tabler/icons-react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DocumentUploadDialog } from "~/components/document-upload-dialog";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate, formatFileSize, truncateTextMiddle } from "~/lib/dashboard-utils";

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
  const navigate = useNavigate();
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "status" | "size">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchValue, setSearchValue] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  // Document status options for filter
  const statusOptions = [
    {
      label: "Processing",
      value: "processing",
      icon: IconClock,
    },
    {
      label: "Uploaded",
      value: "uploaded",
      icon: UploadIcon,
    },
    {
      label: "Completed",
      value: "completed",
      icon: IconCircleCheck,
    },
    {
      label: "Failed",
      value: "failed",
      icon: IconX,
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

  const vectorizeMutation = useMutation({
    ...trpc.documents.vectorize.mutationOptions(),
    onMutate: () => {
      // Show toast immediately when vectorization starts
      toast.success("Document vectorization started! This may take a few moments.");
    },
    onSuccess: () => {
      void refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to vectorize document");
    },
    onSettled: () => {
      void refetch();
    },
  });

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    deleteMutation.mutate(id);
  };

  const handleVectorize = (id: string) => {
    vectorizeMutation.mutate({ documentId: id });
  };

  const canVectorize = (status: string) => {
    // Only allow vectorization for uploaded or failed documents
    return status === "uploaded" || status === "failed";
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
                  title={document.name}
                  type="button"
                >
                  <span className="truncate">{truncateTextMiddle(document.name, 50, 20, 20)}</span>
                  <IconExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ) : (
                <div className="font-medium flex-1 truncate" title={document.name}>
                  {truncateTextMiddle(document.name, 50, 20, 20)}
                </div>
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
                  <IconCopy className="h-3.5 w-3.5" />
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
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline">
                    <IconDots className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                }
              />

              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {document.status === "completed" && (
                  <DropdownMenuItem
                    onClick={() => {
                      navigate({ to: `/dashboard/documents/${document.id}/chat` });
                    }}
                  >
                    <IconMessage className="mr-2 h-4 w-4" />
                    Chat with Document
                  </DropdownMenuItem>
                )}
                {document.status === "completed" && <DropdownMenuSeparator />}
                {canVectorize(document.status) && (
                  <DropdownMenuItem
                    disabled={vectorizeMutation.isPending || document.status === "processing"}
                    onClick={() => {
                      handleVectorize(document.id);
                    }}
                  >
                    <IconBrain className="mr-2 h-4 w-4" />
                    Vectorize
                  </DropdownMenuItem>
                )}
                {canVectorize(document.status) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    handleDelete(document.id);
                  }}
                >
                  <IconTrash className="mr-2 h-4 w-4" />
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
            <IconChevronLeft className="size-5" />
          </Button>
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <IconBook className="h-5 w-5 text-primary" />
              {dataset.name}
            </CardTitle>
            <CardDescription className="mt-1.5">
              {dataset.description || "Manage documents in this dataset"}
            </CardDescription>
          </div>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            navigate({ to: `/dashboard/datasets/${dataset.id}/chat` });
          }}
          size="sm"
        >
          <IconMessage className="h-4 w-4" />
          Chat with Dataset
        </Button>
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
                    <IconPlus className="h-4 w-4 mr-2" />
                    Upload Documents
                  </>
                }
                description="Upload documents to this dataset"
                icon={IconFileText}
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
              <Button
                className="gap-2 shadow-lg shadow-primary/20"
                onClick={() => setIsUploadDialogOpen(true)}
                size="sm"
              >
                <IconUpload className="h-4 w-4" />
                Upload Documents
              </Button>
              <DocumentUploadDialog
                datasetId={dataset.id}
                datasetName={dataset.name}
                onOpenChange={setIsUploadDialogOpen}
                onSuccess={() => {
                  void refetch();
                }}
                open={isUploadDialogOpen}
              />
              <Button
                disabled={isFetching}
                onClick={() => {
                  void refetch();
                }}
                size="sm"
                variant="outline"
              >
                <IconRefresh className={cn("h-4 w-4", isFetching ? "animate-spin" : "")} />
              </Button>
            </>
          }
        />
      </CardContent>
    </Card>
  );
}
