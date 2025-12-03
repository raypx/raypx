import { useTRPC } from "@raypx/trpc/client";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { DataTable } from "~/components/data-table";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { formatDate, formatFileSize } from "~/lib/dashboard-utils";

type DocumentListItem = {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  metadata: Record<string, any> | null;
  knowledgeBaseId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export const Route = createFileRoute("/dashboard/documents/")({
  component: DocumentsPage,
});

function DocumentsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-1">Upload, process, and manage your documents</p>
        </div>
      </div>

      <DocumentUsageStats />

      <div className="space-y-4">
        <DocumentsSection />
      </div>
    </div>
  );
}

function DocumentUsageStats() {
  const usageStats = [
    {
      title: "Processed",
      value: "0",
      icon: CheckCircle2,
      description: "Successfully indexed",
    },
    {
      title: "Processing",
      value: "0",
      icon: Loader2,
      description: "Currently indexing",
    },
    {
      title: "Total Size",
      value: "0 B",
      icon: HardDrive,
      description: "Storage used",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {usageStats.map((stat) => (
        <Card className="bg-card/50 backdrop-blur-sm" key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentsSection() {
  const trpc = useTRPC();
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "status" | "size">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"processing" | "completed" | "failed" | "all">(
    "all",
  );
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState<string>("all");

  // Fetch knowledge bases for filter
  const { data: knowledges } = useQuery(
    trpc.knowledges.list.queryOptions({ status: "all" }, { staleTime: 60_000 }),
  );

  const documentsQuery = useQuery({
    ...trpc.documents.list.queryOptions(
      {
        sortBy,
        sortOrder,
        status: statusFilter === "all" ? undefined : statusFilter,
        knowledgeBaseId: knowledgeBaseFilter === "all" ? undefined : knowledgeBaseFilter,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = documentsQuery;

  const documents: DocumentListItem[] = useMemo(() => (data ?? []) as DocumentListItem[], [data]);

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading documents."}
        onRetry={() => {
          void refetch();
        }}
        retrying={isFetching}
      />
    );
  } else if (documents.length === 0) {
    content = <EmptyState description="No documents found" icon={FileText} title="No Documents" />;
  } else {
    content = (
      <DocumentsTable
        documents={documents}
        isLoading={isPending}
        knowledges={knowledges ?? []}
        onChanged={() => {
          void refetch();
        }}
        onSortingChange={(sorting) => {
          if (sorting) {
            setSortBy(sorting.id as typeof sortBy);
            setSortOrder(sorting.desc ? "desc" : "asc");
          }
        }}
      />
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Uploaded Documents
          </CardTitle>
          <CardDescription className="mt-1.5">
            {documents.length} document{documents.length !== 1 ? "s" : ""} in total
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value) => setKnowledgeBaseFilter(value)}
              value={knowledgeBaseFilter}
            >
              <SelectTrigger className="w-48 h-9 bg-background/50 border-border/50">
                <SelectValue placeholder="Knowledge Base" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Knowledge</SelectItem>
                {(knowledges ?? []).map((kb) => (
                  <SelectItem key={kb.id} value={kb.id}>
                    {kb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              value={statusFilter}
            >
              <SelectTrigger className="w-32 h-9 bg-background/50 border-border/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
            size="sm"
            variant="outline"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">{content}</CardContent>
    </Card>
  );
}

function DocumentsTable({
  documents,
  isLoading = false,
  knowledges,
  onChanged,
  onSortingChange,
}: {
  documents: DocumentListItem[];
  isLoading?: boolean;
  knowledges: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onSortingChange?: (sorting: { id: string; desc: boolean } | null) => void;
}) {
  const trpc = useTRPC();
  const deleteMutation = useMutation({
    ...trpc.documents.delete.mutationOptions(),
    onSuccess: () => {
      onChanged();
      toast.success("Document deleted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    deleteMutation.mutate(id);
  };

  const getKnowledgeBaseName = (id: string) => {
    return knowledges.find((kb) => kb.id === id)?.name || "Unknown";
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "processing":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  // Define columns
  const columns = useMemo<ColumnDef<DocumentListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "originalName",
        header: "Original Name",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">{row.original.originalName}</div>
        ),
      },
      {
        accessorKey: "knowledgeBaseId",
        header: "Knowledge Base",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm">{getKnowledgeBaseName(row.original.knowledgeBaseId)}</div>
        ),
      },
      {
        accessorKey: "size",
        header: "Size",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">{formatFileSize(row.original.size)}</div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status) as any}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
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
    [deleteMutation.isPending, handleDelete, knowledges],
  );

  const [selectedRows, setSelectedRows] = useState<DocumentListItem[]>([]);

  return (
    <>
      {selectedRows.length > 0 && (
        <div className="px-6 py-2 bg-muted border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""} selected
            </span>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete ${selectedRows.length} document${selectedRows.length !== 1 ? "s" : ""}?`,
                  )
                ) {
                  selectedRows.forEach((doc) => {
                    deleteMutation.mutate(doc.id);
                  });
                  setSelectedRows([]);
                }
              }}
              size="sm"
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        data={documents}
        enableSelection
        enableSorting
        initialSorting={{ id: "createdAt", desc: true }}
        isLoading={isLoading}
        manualSorting
        onSelectionChange={setSelectedRows}
        onSortingChange={onSortingChange}
      />
    </>
  );
}
