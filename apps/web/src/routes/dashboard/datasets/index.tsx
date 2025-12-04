import { useTRPC } from "@raypx/trpc/client";
import { ServerCardGrid } from "@raypx/ui/business";
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Edit, Eye, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate } from "~/lib/dashboard-utils";

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

export const Route = createFileRoute("/dashboard/datasets/")({
  component: DatasetsPage,
});

function DatasetsPage() {
  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <DatasetsSection />
      </div>
    </PageWrapper>
  );
}

function DatasetsSection() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<DatasetListItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const datasetsQuery = useQuery({
    ...trpc.datasets.list.queryOptions(
      {
        sortBy: "createdAt",
        sortOrder: "desc",
        status: statusFilter,
        page,
        pageSize,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isError, error, refetch, isFetching } = datasetsQuery;

  const datasets: DatasetListItem[] = useMemo(
    () => (data?.items ?? []) as DatasetListItem[],
    [data?.items],
  );
  const total = data?.total ?? 0;

  // Create dataset mutation
  const createMutation = useMutation({
    ...trpc.datasets.create.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      void refetch();
      toast.success("Dataset created successfully!");
      setIsCreateDialogOpen(false);
      // Reset to first page after creating
      setPage(1);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create dataset");
    },
  });

  const updateMutation = useMutation({
    ...trpc.datasets.update.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      void refetch();
      toast.success("Dataset updated successfully!");
      setIsEditDialogOpen(false);
      setEditingDataset(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update dataset");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.datasets.delete.mutationOptions(),
    onSuccess: () => {
      void refetch();
      toast.success("Dataset deleted successfully!");
      // If current page becomes empty after deletion, go to previous page
      if (datasets.length === 1 && page > 1) {
        setPage(page - 1);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete dataset");
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

  const handleUpdate = () => {
    if (!editingDataset) return;
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    updateMutation.mutate({
      id: editingDataset.id,
      name: newName.trim(),
      description: newDescription.trim() || undefined,
    });
  };

  const handleDelete = (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this dataset? All documents in it will be deleted.",
      )
    )
      return;
    deleteMutation.mutate(id);
  };

  const openEditDialog = (ds: DatasetListItem) => {
    setEditingDataset(ds);
    setNewName(ds.name);
    setNewDescription(ds.description ?? "");
    setIsEditDialogOpen(true);
  };

  const handleViewDocuments = (datasetId: string) => {
    navigate({ to: "/dashboard/datasets/$id/document", params: { id: datasetId } });
  };

  const renderDatasetCard = (ds: DatasetListItem) => (
    <Card
      className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
      key={ds.id}
      onClick={() => handleViewDocuments(ds.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base group-hover:text-primary transition-colors">
                {ds.name}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {ds.description || "No description"}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                className="size-8 opacity-0 group-hover:opacity-100"
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDocuments(ds.id);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View Documents
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openEditDialog(ds);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(ds.id);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Created {formatDate(ds.createdAt)}</p>
          <Badge className="text-xs" variant={ds.status === "active" ? "default" : "secondary"}>
            {ds.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            Datasets
          </CardTitle>
          <CardDescription className="mt-1.5">
            {total > 0
              ? `${total} dataset${total !== 1 ? "s" : ""} total, showing ${datasets.length} on page ${page}`
              : "No datasets available"}
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <Select
            onValueChange={(value) => {
              setStatusFilter(value as typeof statusFilter);
              setPage(1); // Reset to first page when filter changes
            }}
            value={statusFilter}
          >
            <SelectTrigger className="w-32 h-9 bg-background/50 border-border/50">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
                <Plus className="h-4 w-4" />
                Create Dataset
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Dataset</DialogTitle>
                <DialogDescription>
                  Create a new dataset to organize and search your documents effectively.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    className="bg-muted/50"
                    id="name"
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Product Documentation"
                    value={newName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    className="bg-muted/50 min-h-[100px]"
                    id="description"
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe what kind of documents this dataset will contain..."
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
                  {createMutation.isPending ? "Creating..." : "Create Dataset"}
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
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <ErrorState
            message={error?.message ?? "Something went wrong while loading datasets."}
            onRetry={() => {
              void refetch();
            }}
            retrying={isFetching}
          />
        ) : (
          <ServerCardGrid
            data={datasets}
            empty={{
              component: (
                <EmptyState
                  actionLabel={
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Dataset
                    </>
                  }
                  description="Create your first dataset to get started"
                  icon={BookOpen}
                  onAction={() => setIsCreateDialogOpen(true)}
                  title="No Datasets"
                />
              ),
            }}
            isLoading={datasetsQuery.isPending}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: (newPage) => setPage(newPage),
              onPageSizeChange: (newPageSize) => {
                setPageSize(newPageSize);
                setPage(1);
              },
            }}
            renderCard={renderDatasetCard}
            skeletonRows={6}
          />
        )}
      </CardContent>

      {/* Edit Dataset Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingDataset(null);
            setNewName("");
            setNewDescription("");
          }
        }}
        open={isEditDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Dataset</DialogTitle>
            <DialogDescription>Update the dataset information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                className="bg-muted/50"
                id="edit-name"
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Product Documentation"
                value={newName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                className="bg-muted/50 min-h-[100px]"
                id="edit-description"
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe what kind of documents this dataset will contain..."
                value={newDescription}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingDataset(null);
                setNewName("");
                setNewDescription("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={updateMutation.isPending} onClick={handleUpdate}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
