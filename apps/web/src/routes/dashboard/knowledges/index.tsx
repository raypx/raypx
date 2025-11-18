import { useTRPC } from "@raypx/trpc/client";
import {
  Badge,
  Button,
  Card,
  CardAction,
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { BookOpen, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { formatDate } from "@/lib/dashboard-utils";

type KnowledgeListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  settings: Record<string, any> | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export const Route = createFileRoute("/dashboard/knowledges/")({
  component: KnowledgesPage,
});

function KnowledgesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge</h1>
          <p className="text-muted-foreground">Manage your knowledge bases and documents</p>
        </div>
      </div>
      <KnowledgesSection />
    </div>
  );
}

function KnowledgesSection() {
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "status">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("all");

  const knowledgesQuery = useQuery({
    ...trpc.knowledges.list.queryOptions(
      {
        sortBy,
        sortOrder,
        status: statusFilter,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = knowledgesQuery;

  const knowledges: KnowledgeListItem[] = useMemo(
    () => (data ?? []) as KnowledgeListItem[],
    [data],
  );

  // Create knowledge base mutation
  const createMutation = useMutation({
    ...trpc.knowledges.create.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      void refetch();
      toast.success("Knowledge base created successfully!");
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create knowledge base");
    },
  });

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    createMutation.mutate({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      status: "active",
    });
  };

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading knowledge bases."}
        onRetry={() => {
          void refetch();
        }}
        retrying={isFetching}
      />
    );
  } else if (knowledges.length === 0) {
    content = (
      <EmptyState
        actionLabel={
          <>
            <Plus className="h-4 w-4 mr-2" />
            Create Knowledge Base
          </>
        }
        description="Create your first knowledge base to get started"
        icon={BookOpen}
        onAction={() => setIsCreateDialogOpen(true)}
        title="No Knowledge"
      />
    );
  } else {
    content = (
      <KnowledgesTable
        isLoading={isPending}
        knowledges={knowledges}
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
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Knowledge
        </CardTitle>
        <CardDescription>
          {`${knowledges.length} knowledge${knowledges.length !== 1 ? "s" : ""}`}
        </CardDescription>
        <CardAction>
          <Select
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            value={statusFilter}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Create Knowledge Base
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Knowledge Base</DialogTitle>
                <DialogDescription>
                  Create a new knowledge base to organize your documents
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Product Documentation"
                    value={newName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Optional description"
                    value={newDescription}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setNewName("");
                    setNewDescription("");
                  }}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={createMutation.isPending} onClick={handleCreate}>
                  {createMutation.isPending ? "Creating..." : "Create"}
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
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">{content}</CardContent>
    </Card>
  );
}

function KnowledgesTable({
  knowledges,
  isLoading = false,
  onChanged,
  onSortingChange,
}: {
  knowledges: KnowledgeListItem[];
  isLoading?: boolean;
  onChanged: () => void;
  onSortingChange?: (sorting: { id: string; desc: boolean } | null) => void;
}) {
  const trpc = useTRPC();
  const deleteMutation = useMutation({
    ...trpc.knowledges.delete.mutationOptions(),
    onSuccess: () => {
      onChanged();
      toast.success("Knowledge base deleted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete knowledge base");
    },
  });

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this knowledge base?")) return;
    deleteMutation.mutate(id);
  };

  // Define columns
  const columns = useMemo<ColumnDef<KnowledgeListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
      },
      {
        accessorKey: "description",
        header: "Description",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-md truncate">
            {row.original.description || "--"}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
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
          const knowledge = row.original;
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
                    handleDelete(knowledge.id);
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
    [deleteMutation.isPending, handleDelete],
  );

  const [selectedRows, setSelectedRows] = useState<KnowledgeListItem[]>([]);

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
                    `Are you sure you want to delete ${selectedRows.length} knowledge base${selectedRows.length !== 1 ? "s" : ""}?`,
                  )
                ) {
                  selectedRows.forEach((kb) => {
                    deleteMutation.mutate(kb.id);
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
        data={knowledges}
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
