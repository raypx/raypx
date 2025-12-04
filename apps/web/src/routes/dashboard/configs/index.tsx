import { useTRPC } from "@raypx/trpc/client";
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
  Switch,
  Textarea,
} from "@raypx/ui/components";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@raypx/ui/components/alert-dialog";
import { toast } from "@raypx/ui/components/toast";
import { cn } from "@raypx/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Edit, FolderCog, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ServerCardGrid } from "~/components/data-table/card-grid";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate } from "~/lib/dashboard-utils";

type Namespace = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ConfigItem and HistoryItem types moved to $id.tsx

export const Route = createFileRoute("/dashboard/configs/")({
  component: ConfigsPage,
});

function ConfigsPage() {
  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <NamespacesSection />
      </div>
    </PageWrapper>
  );
}

// ==================== Namespaces Section ====================

function NamespacesSection() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [namespaceToDelete, setNamespaceToDelete] = useState<Namespace | null>(null);
  const [editingNamespace, setEditingNamespace] = useState<Namespace | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchValue);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const namespacesQuery = useQuery({
    ...trpc.configs.listNamespaces.queryOptions(
      { q: q.trim() || undefined, page, pageSize },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = namespacesQuery;

  const namespaces: Namespace[] = useMemo(() => (data?.items ?? []) as Namespace[], [data?.items]);
  const total = data?.total ?? 0;

  const createMutation = useMutation({
    ...trpc.configs.createNamespace.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      setNewIcon("");
      void refetch();
      toast.success("Namespace created successfully!");
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create namespace");
    },
  });

  const updateMutation = useMutation({
    ...trpc.configs.updateNamespace.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      setNewIcon("");
      void refetch();
      toast.success("Namespace updated successfully!");
      setIsEditDialogOpen(false);
      setEditingNamespace(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update namespace");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.configs.deleteNamespace.mutationOptions(),
    onSuccess: () => {
      void refetch();
      toast.success("Namespace deleted successfully!");
      setDeleteConfirmOpen(false);
      setNamespaceToDelete(null);
      if (namespaces.length === 1 && page > 1) {
        setPage(page - 1);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete namespace");
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
      icon: newIcon.trim() || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingNamespace) return;
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }
    updateMutation.mutate({
      id: editingNamespace.id,
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      icon: newIcon.trim() || undefined,
    });
  };

  const openDeleteConfirm = useCallback((ns: Namespace) => {
    setNamespaceToDelete(ns);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (!namespaceToDelete) return;
    deleteMutation.mutate(namespaceToDelete.id);
  }, [namespaceToDelete, deleteMutation]);

  const openEditDialog = (ns: Namespace) => {
    setEditingNamespace(ns);
    setNewName(ns.name);
    setNewDescription(ns.description ?? "");
    setNewIcon(ns.icon ?? "");
    setIsEditDialogOpen(true);
  };

  const handleViewConfigs = useCallback(
    (namespaceId: string) => {
      navigate({ to: "/dashboard/configs/$id", params: { id: namespaceId } });
    },
    [navigate],
  );

  const renderNamespaceCard = useCallback(
    (ns: Namespace) => (
      <Card
        className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
        key={ns.id}
        onClick={() => handleViewConfigs(ns.id)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FolderCog className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base group-hover:text-primary transition-colors">
                  {ns.name}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {ns.description || "No description"}
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
                    openEditDialog(ns);
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
                    openDeleteConfirm(ns);
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
          <p className="text-xs text-muted-foreground">Created {formatDate(ns.createdAt)}</p>
        </CardContent>
      </Card>
    ),
    [handleViewConfigs, openDeleteConfirm],
  );

  const handleResetFilters = useCallback(() => {
    setSearchValue("");
    setPage(1);
  }, []);

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-primary" />
              Configuration Center
            </CardTitle>
            <CardDescription className="mt-1.5">
              Manage your application configurations organized by namespaces
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
                  <Plus className="h-4 w-4" />
                  Create Namespace
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Namespace</DialogTitle>
                  <DialogDescription>
                    Create a namespace to organize related configurations together.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-name">Name</Label>
                    <Input
                      className="bg-muted/50"
                      id="create-name"
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., AI Settings, Email Config"
                      value={newName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-description">Description</Label>
                    <Textarea
                      className="bg-muted/50 min-h-[80px]"
                      id="create-description"
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Describe what configurations this namespace will contain..."
                      value={newDescription}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-icon">Icon (Optional)</Label>
                    <Input
                      className="bg-muted/50"
                      id="create-icon"
                      onChange={(e) => setNewIcon(e.target.value)}
                      placeholder="e.g., Settings, Database"
                      value={newIcon}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setNewName("");
                      setNewDescription("");
                      setNewIcon("");
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button disabled={createMutation.isPending} onClick={handleCreate}>
                    {createMutation.isPending ? "Creating..." : "Create Namespace"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              disabled={isFetching}
              onClick={() => void refetch()}
              size="sm"
              variant="outline"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ServerCardGrid
            data={namespaces}
            emptyComponent={
              <EmptyState
                actionLabel={
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Namespace
                  </>
                }
                description="Create your first namespace to organize your configurations"
                icon={FolderCog}
                onAction={() => setIsCreateDialogOpen(true)}
                title="No Namespaces"
              />
            }
            emptyMessage="No namespaces found"
            filters={[]}
            getCardKey={(ns) => ns.id}
            gridCols={{ default: 1, md: 2, lg: 3 }}
            isLoading={isPending}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onResetFilters={handleResetFilters}
            onSearchChange={setSearchValue}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={[12, 24, 48, 96]}
            renderCard={renderNamespaceCard}
            searchPlaceholder="Search namespaces..."
            searchValue={searchValue}
            total={total}
          />
        </CardContent>
      </Card>

      {/* Edit Namespace Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingNamespace(null);
            setNewName("");
            setNewDescription("");
            setNewIcon("");
          }
        }}
        open={isEditDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Namespace</DialogTitle>
            <DialogDescription>Update the namespace information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                className="bg-muted/50"
                id="edit-name"
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., AI Settings, Email Config"
                value={newName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                className="bg-muted/50 min-h-[80px]"
                id="edit-description"
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe what configurations this namespace will contain..."
                value={newDescription}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-icon">Icon (Optional)</Label>
              <Input
                className="bg-muted/50"
                id="edit-icon"
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="e.g., Settings, Database"
                value={newIcon}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingNamespace(null);
                setNewName("");
                setNewDescription("");
                setNewIcon("");
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Namespace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete namespace <strong>{namespaceToDelete?.name}</strong>?
              All configs in it will be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
