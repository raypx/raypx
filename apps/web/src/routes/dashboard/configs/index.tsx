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
import { toast } from "@raypx/ui/components/toast";
import { cn } from "@raypx/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ChevronLeft,
  Clock,
  Copy,
  Edit,
  Eye,
  EyeOff,
  FolderCog,
  History,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { DataTable } from "~/components/data-table";
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

type ConfigItem = {
  id: string;
  key: string;
  value: string | null;
  valueType: string;
  description: string | null;
  isSecret: boolean | null;
  metadata: Record<string, unknown> | null;
  namespaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

type HistoryItem = {
  id: string;
  previousValue: string | null;
  newValue: string | null;
  changeReason: string | null;
  createdAt: Date;
};

export const Route = createFileRoute("/dashboard/configs/")({
  component: ConfigsPage,
});

function ConfigsPage() {
  const [selectedNamespace, setSelectedNamespace] = useState<Namespace | null>(null);

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        {selectedNamespace ? (
          <ConfigsSection
            namespace={selectedNamespace}
            onBack={() => setSelectedNamespace(null)}
          />
        ) : (
          <NamespacesSection onSelectNamespace={setSelectedNamespace} />
        )}
      </div>
    </PageWrapper>
  );
}

// ==================== Namespaces Section ====================

function NamespacesSection({
  onSelectNamespace,
}: {
  onSelectNamespace: (ns: Namespace) => void;
}) {
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const namespacesQuery = useQuery({
    ...trpc.configs.listNamespaces.queryOptions(undefined, { staleTime: 30_000 }),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = namespacesQuery;

  const namespaces: Namespace[] = useMemo(() => (data ?? []) as Namespace[], [data]);

  const createMutation = useMutation({
    ...trpc.configs.createNamespace.mutationOptions(),
    onSuccess: () => {
      setNewName("");
      setNewDescription("");
      void refetch();
      toast.success("Namespace created successfully!");
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create namespace");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.configs.deleteNamespace.mutationOptions(),
    onSuccess: () => {
      void refetch();
      toast.success("Namespace deleted successfully!");
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
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this namespace? All configs in it will be deleted.")) return;
    deleteMutation.mutate(id);
  };

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading namespaces."}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  } else if (namespaces.length === 0 && !isPending) {
    content = (
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
    );
  } else {
    content = (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
        {namespaces.map((ns) => (
          <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
            key={ns.id}
            onClick={() => onSelectNamespace(ns)}
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
                    <Button size="icon" variant="ghost" className="size-8 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ns.id);
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
              <p className="text-xs text-muted-foreground">
                Created {formatDate(ns.createdAt)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
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
                  <Label htmlFor="name">Name</Label>
                  <Input
                    className="bg-muted/50"
                    id="name"
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., AI Settings, Email Config"
                    value={newName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    className="bg-muted/50 min-h-[80px]"
                    id="description"
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe what configurations this namespace will contain..."
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
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}

// ==================== Configs Section ====================

function ConfigsSection({
  namespace,
  onBack,
}: {
  namespace: Namespace;
  onBack: () => void;
}) {
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [historyConfigId, setHistoryConfigId] = useState<string | null>(null);

  // Form state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newValueType, setNewValueType] = useState<"string" | "number" | "boolean" | "json">("string");
  const [newDescription, setNewDescription] = useState("");
  const [newIsSecret, setNewIsSecret] = useState(false);

  const configsQuery = useQuery({
    ...trpc.configs.list.queryOptions(
      { namespaceId: namespace.id, sortBy: "key", sortOrder: "asc" },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = configsQuery;

  const configs: ConfigItem[] = useMemo(() => (data ?? []) as ConfigItem[], [data]);

  const createMutation = useMutation({
    ...trpc.configs.create.mutationOptions(),
    onSuccess: () => {
      resetForm();
      void refetch();
      toast.success("Config created successfully!");
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create config");
    },
  });

  const updateMutation = useMutation({
    ...trpc.configs.update.mutationOptions(),
    onSuccess: () => {
      resetForm();
      void refetch();
      toast.success("Config updated successfully!");
      setIsEditDialogOpen(false);
      setEditingConfig(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update config");
    },
  });

  const deleteMutation = useMutation({
    ...trpc.configs.delete.mutationOptions(),
    onSuccess: () => {
      void refetch();
      toast.success("Config deleted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete config");
    },
  });

  const resetForm = () => {
    setNewKey("");
    setNewValue("");
    setNewValueType("string");
    setNewDescription("");
    setNewIsSecret(false);
  };

  const handleCreate = () => {
    if (!newKey.trim()) {
      toast.error("Please enter a key");
      return;
    }
    createMutation.mutate({
      namespaceId: namespace.id,
      key: newKey.trim(),
      value: newValue,
      valueType: newValueType,
      description: newDescription.trim() || undefined,
      isSecret: newIsSecret,
    });
  };

  const handleUpdate = () => {
    if (!editingConfig) return;
    updateMutation.mutate({
      id: editingConfig.id,
      key: newKey.trim(),
      value: newValue,
      valueType: newValueType,
      description: newDescription.trim() || undefined,
      isSecret: newIsSecret,
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this config?")) return;
    deleteMutation.mutate(id);
  };

  const openEditDialog = (config: ConfigItem) => {
    setEditingConfig(config);
    setNewKey(config.key);
    setNewValue(config.value ?? "");
    setNewValueType(config.valueType as typeof newValueType);
    setNewDescription(config.description ?? "");
    setNewIsSecret(config.isSecret ?? false);
    setIsEditDialogOpen(true);
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard!");
  };

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading configs."}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  } else if (configs.length === 0 && !isPending) {
    content = (
      <EmptyState
        actionLabel={
          <>
            <Plus className="h-4 w-4 mr-2" />
            Add Config
          </>
        }
        description="Add your first configuration item to this namespace"
        icon={Settings}
        onAction={() => setIsCreateDialogOpen(true)}
        title="No Configs"
      />
    );
  } else {
    content = (
      <ConfigsTable
        configs={configs}
        isLoading={isPending}
        onCopy={copyToClipboard}
        onDelete={handleDelete}
        onEdit={openEditDialog}
        onViewHistory={(id) => {
          setHistoryConfigId(id);
          setIsHistoryDialogOpen(true);
        }}
      />
    );
  }

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={onBack} size="icon" variant="ghost">
              <ChevronLeft className="size-5" />
            </Button>
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderCog className="h-5 w-5 text-primary" />
                {namespace.name}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {namespace.description || "Manage configurations in this namespace"}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dialog
              onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (!open) resetForm();
              }}
              open={isCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
                  <Plus className="h-4 w-4" />
                  Add Config
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add New Config</DialogTitle>
                  <DialogDescription>
                    Add a new configuration item to {namespace.name}.
                  </DialogDescription>
                </DialogHeader>
                <ConfigForm
                  description={newDescription}
                  isSecret={newIsSecret}
                  keyValue={newKey}
                  onDescriptionChange={setNewDescription}
                  onIsSecretChange={setNewIsSecret}
                  onKeyChange={setNewKey}
                  onValueChange={setNewValue}
                  onValueTypeChange={setNewValueType}
                  value={newValue}
                  valueType={newValueType}
                />
                <DialogFooter>
                  <Button onClick={() => setIsCreateDialogOpen(false)} variant="outline">
                    Cancel
                  </Button>
                  <Button disabled={createMutation.isPending} onClick={handleCreate}>
                    {createMutation.isPending ? "Creating..." : "Create Config"}
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
        <CardContent className="p-0">{content}</CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingConfig(null);
            resetForm();
          }
        }}
        open={isEditDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Config</DialogTitle>
            <DialogDescription>
              Update the configuration value.
            </DialogDescription>
          </DialogHeader>
          <ConfigForm
            description={newDescription}
            isSecret={newIsSecret}
            keyValue={newKey}
            onDescriptionChange={setNewDescription}
            onIsSecretChange={setNewIsSecret}
            onKeyChange={setNewKey}
            onValueChange={setNewValue}
            onValueTypeChange={setNewValueType}
            value={newValue}
            valueType={newValueType}
          />
          <DialogFooter>
            <Button onClick={() => setIsEditDialogOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={updateMutation.isPending} onClick={handleUpdate}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setIsHistoryDialogOpen(open);
          if (!open) setHistoryConfigId(null);
        }}
        open={isHistoryDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5" />
              Change History
            </DialogTitle>
            <DialogDescription>
              View the history of changes for this configuration.
            </DialogDescription>
          </DialogHeader>
          {historyConfigId && <ConfigHistoryList configId={historyConfigId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ==================== Config Form ====================

function ConfigForm({
  keyValue,
  value,
  valueType,
  description,
  isSecret,
  onKeyChange,
  onValueChange,
  onValueTypeChange,
  onDescriptionChange,
  onIsSecretChange,
}: {
  keyValue: string;
  value: string;
  valueType: "string" | "number" | "boolean" | "json";
  description: string;
  isSecret: boolean;
  onKeyChange: (v: string) => void;
  onValueChange: (v: string) => void;
  onValueTypeChange: (v: "string" | "number" | "boolean" | "json") => void;
  onDescriptionChange: (v: string) => void;
  onIsSecretChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="key">Key</Label>
        <Input
          className="bg-muted/50 font-mono"
          id="key"
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder="e.g., OPENAI_API_KEY"
          value={keyValue}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="valueType">Type</Label>
          <Select onValueChange={onValueTypeChange} value={valueType}>
            <SelectTrigger className="bg-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="isSecret">Secret</Label>
          <div className="flex items-center gap-2 h-9">
            <Switch checked={isSecret} id="isSecret" onCheckedChange={onIsSecretChange} />
            <Label className="text-sm text-muted-foreground font-normal" htmlFor="isSecret">
              Hide value
            </Label>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="value">Value</Label>
        {valueType === "boolean" ? (
          <Select onValueChange={onValueChange} value={value}>
            <SelectTrigger className="bg-muted/50">
              <SelectValue placeholder="Select value" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        ) : valueType === "json" ? (
          <Textarea
            className="bg-muted/50 min-h-[120px] font-mono text-sm"
            id="value"
            onChange={(e) => onValueChange(e.target.value)}
            placeholder='{"key": "value"}'
            value={value}
          />
        ) : (
          <Input
            className="bg-muted/50 font-mono"
            id="value"
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="Enter value..."
            type={isSecret ? "password" : valueType === "number" ? "number" : "text"}
            value={value}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          className="bg-muted/50 min-h-[60px]"
          id="description"
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe what this config is for..."
          value={description}
        />
      </div>
    </div>
  );
}

// ==================== Configs Table ====================

function ConfigsTable({
  configs,
  isLoading,
  onEdit,
  onDelete,
  onCopy,
  onViewHistory,
}: {
  configs: ConfigItem[];
  isLoading: boolean;
  onEdit: (config: ConfigItem) => void;
  onDelete: (id: string) => void;
  onCopy: (value: string) => void;
  onViewHistory: (configId: string) => void;
}) {
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  const toggleSecretVisibility = (id: string) => {
    const newSet = new Set(visibleSecrets);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setVisibleSecrets(newSet);
  };

  const columns = useMemo<ColumnDef<ConfigItem>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => (
          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
            {row.original.key}
          </code>
        ),
      },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) => {
          const config = row.original;
          const isVisible = visibleSecrets.has(config.id);
          const displayValue = config.isSecret && !isVisible ? "••••••••" : (config.value ?? "");

          return (
            <div className="flex items-center gap-2 max-w-xs">
              <code className={cn(
                "font-mono text-sm truncate",
                config.valueType === "boolean" && "text-blue-500",
                config.valueType === "number" && "text-green-500",
              )}>
                {displayValue || <span className="text-muted-foreground italic">empty</span>}
              </code>
              {config.isSecret && (
                <Button
                  onClick={() => toggleSecretVisibility(config.id)}
                  size="icon"
                  variant="ghost"
                  className="size-6"
                >
                  {isVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </Button>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "valueType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.original.valueType}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-xs truncate">
            {row.original.description || "--"}
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatDate(row.original.updatedAt)}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const config = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(config)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {!config.isSecret && config.value && (
                  <DropdownMenuItem onClick={() => onCopy(config.value ?? "")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Value
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onViewHistory(config.id)}>
                  <History className="mr-2 h-4 w-4" />
                  View History
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(config.id)}
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
    [visibleSecrets, onEdit, onDelete, onCopy, onViewHistory],
  );

  return (
    <DataTable
      columns={columns}
      data={configs}
      isLoading={isLoading}
    />
  );
}

// ==================== Config History List ====================

function ConfigHistoryList({ configId }: { configId: string }) {
  const trpc = useTRPC();

  const historyQuery = useQuery({
    ...trpc.configs.getHistory.queryOptions({ configId, limit: 20 }, { staleTime: 10_000 }),
  });

  const { data, isPending, isError } = historyQuery;

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load history
      </div>
    );
  }

  const history = (data ?? []) as HistoryItem[];

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No change history available
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto">
      {history.map((item) => (
        <div
          className="rounded-lg border p-3 space-y-2"
          key={item.id}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {formatDate(item.createdAt)}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">From:</span>
              <code className="ml-2 font-mono bg-red-500/10 text-red-500 px-1 rounded">
                {item.previousValue ?? "empty"}
              </code>
            </div>
            <div>
              <span className="text-muted-foreground">To:</span>
              <code className="ml-2 font-mono bg-green-500/10 text-green-500 px-1 rounded">
                {item.newValue ?? "empty"}
              </code>
            </div>
          </div>
          {item.changeReason && (
            <p className="text-xs text-muted-foreground italic">
              Reason: {item.changeReason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

