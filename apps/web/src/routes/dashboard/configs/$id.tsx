import { useTRPC } from "@raypx/trpc/client";
import { DataTableColumnHeader, ServerDataTable } from "@raypx/ui/business";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import {
  IconChevronLeft,
  IconClock,
  IconCopy,
  IconDots,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFolderCog,
  IconHistory,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate } from "~/lib/dashboard-utils";
import { type ConfigItem, useConfigsStore } from "~/store/configs";

export const Route = createFileRoute("/dashboard/configs/$id")({
  component: ConfigsPage,
});

type Namespace = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: string | null;
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

function ConfigsPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();

  // Fetch namespace by ID
  const namespaceQuery = useQuery({
    ...trpc.configs.getNamespaceById.queryOptions({ id }),
    enabled: !!id,
  });

  const namespace = namespaceQuery.data;

  if (namespaceQuery.isPending) {
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

  if (namespaceQuery.isError || !namespace) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={namespaceQuery.error?.message ?? "Namespace not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/configs" });
          }}
          retrying={namespaceQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <ConfigsSection
          namespace={{
            id: namespace.id,
            name: namespace.name,
            description: namespace.description,
            icon: namespace.icon,
            sortOrder: namespace.sortOrder,
            createdAt: namespace.createdAt,
            updatedAt: namespace.updatedAt,
          }}
          onBack={() => navigate({ to: "/dashboard/configs" })}
        />
      </div>
    </PageWrapper>
  );
}

function ConfigsSection({ namespace, onBack }: { namespace: Namespace; onBack: () => void }) {
  const trpc = useTRPC();
  const {
    // Dialog states
    isCreateDialogOpen,
    isEditDialogOpen,
    isHistoryDialogOpen,
    deleteConfirmOpen,
    configToDelete,
    editingConfig,
    historyConfigId,
    // Form state
    formData,
    // Search, filter, pagination, and sorting state
    searchValue,
    q,
    valueTypeFilters,
    isSecretFilter,
    sorting,
    page,
    pageSize,
    // Actions
    setCreateDialogOpen,
    setEditDialogOpen,
    setHistoryDialogOpen,
    setDeleteConfirmOpen,
    setConfigToDelete,
    setEditingConfig,
    setHistoryConfigId,
    updateFormData,
    resetForm,
    setSearchValue,
    setQ,
    setValueTypeFilters,
    setIsSecretFilter,
    setSorting,
    setPage,
    setPageSize,
  } = useConfigsStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchValue);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, setQ, setPage]);

  const sortBy =
    sorting[0]?.id === "key" || sorting[0]?.id === "createdAt" || sorting[0]?.id === "updatedAt"
      ? (sorting[0].id as "createdAt" | "key" | "updatedAt")
      : "key";
  const sortOrder = sorting[0]?.desc ? "desc" : "asc";

  const configsQuery = useQuery({
    ...trpc.configs.list.queryOptions(
      {
        namespaceId: namespace.id,
        q: q.trim() || undefined,
        sortBy,
        sortOrder,
        valueType: valueTypeFilters.length > 0 ? (valueTypeFilters as any) : undefined,
        isSecret: isSecretFilter,
        page,
        pageSize,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, refetch, isFetching } = configsQuery;

  const configs: ConfigItem[] = useMemo(() => (data?.items ?? []) as ConfigItem[], [data?.items]);
  const total = data?.total ?? 0;

  const createMutation = useMutation({
    ...trpc.configs.create.mutationOptions(),
    onSuccess: () => {
      resetForm();
      void refetch();
      toast.success("Config created successfully!");
      setCreateDialogOpen(false);
      setPage(1);
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
      setEditDialogOpen(false);
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
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
      if (configs.length === 1 && page > 1) {
        setPage(page - 1);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete config");
    },
  });

  const handleCreate = () => {
    if (!formData.key.trim()) {
      toast.error("Please enter a key");
      return;
    }
    createMutation.mutate({
      namespaceId: namespace.id,
      key: formData.key.trim(),
      value: formData.value,
      valueType: formData.valueType,
      description: formData.description.trim() || undefined,
      isSecret: formData.isSecret,
    });
  };

  const handleUpdate = () => {
    if (!editingConfig) return;
    updateMutation.mutate({
      id: editingConfig.id,
      key: formData.key.trim(),
      value: formData.value,
      valueType: formData.valueType,
      description: formData.description.trim() || undefined,
      isSecret: formData.isSecret,
      changeReason: formData.changeReason.trim() || undefined,
    });
  };

  const openDeleteConfirm = useCallback((config: ConfigItem) => {
    setConfigToDelete(config);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (!configToDelete) return;
    deleteMutation.mutate(configToDelete.id);
  }, [configToDelete, deleteMutation]);

  const openEditDialog = (config: ConfigItem) => {
    setEditingConfig(config);
    updateFormData({
      key: config.key,
      value: config.value ?? "",
      valueType: config.valueType as "string" | "number" | "boolean" | "json",
      description: config.description ?? "",
      isSecret: config.isSecret ?? false,
      changeReason: "",
    });
    setEditDialogOpen(true);
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard!");
  };

  const handleResetFilters = useCallback(() => {
    setSearchValue("");
    setValueTypeFilters([]);
    setIsSecretFilter(undefined);
    setPage(1);
  }, []);

  const valueTypeOptions = [
    { label: "String", value: "string" },
    { label: "Number", value: "number" },
    { label: "Boolean", value: "boolean" },
    { label: "JSON", value: "json" },
  ];

  const isSecretOptions = [
    { label: "Secret", value: "true" },
    { label: "Public", value: "false" },
  ];

  const filters = [
    valueTypeFilters.length > 0 && {
      title: "Type",
      options: valueTypeOptions,
      selectedValues: valueTypeFilters,
      onSelectedValuesChange: setValueTypeFilters,
    },
    isSecretFilter !== undefined && {
      title: "Secret",
      options: isSecretOptions,
      selectedValues: [isSecretFilter.toString()],
      onSelectedValuesChange: (values: string[]) => {
        setIsSecretFilter(values.length > 0 ? values[0] === "true" : undefined);
      },
    },
  ].filter(Boolean) as Array<{
    title: string;
    options: Array<{ label: string; value: string }>;
    selectedValues: string[];
    onSelectedValuesChange: (values: string[]) => void;
  }>;

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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Key" />,
        enableSorting: true,
        cell: ({ row }) => (
          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{row.original.key}</code>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
        enableSorting: false,
        cell: ({ row }) => {
          const config = row.original;
          const isVisible = visibleSecrets.has(config.id);
          const displayValue = config.isSecret && !isVisible ? "••••••••" : (config.value ?? "");

          return (
            <div className="flex items-center gap-2 max-w-xs">
              <code
                className={cn(
                  "font-mono text-sm truncate",
                  config.valueType === "boolean" && "text-blue-500",
                  config.valueType === "number" && "text-green-500",
                )}
              >
                {displayValue || <span className="text-muted-foreground italic">empty</span>}
              </code>
              {config.isSecret && (
                <Button
                  className="size-6"
                  onClick={() => toggleSecretVisibility(config.id)}
                  size="icon"
                  variant="ghost"
                >
                  {isVisible ? <IconEyeOff className="size-3" /> : <IconEye className="size-3" />}
                </Button>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "valueType",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        enableSorting: false,
        cell: ({ row }) => (
          <Badge className="font-mono text-xs" variant="outline">
            {row.original.valueType}
          </Badge>
        ),
      },
      {
        accessorKey: "description",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground max-w-xs truncate">
            {row.original.description || "--"}
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const config = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <IconDots className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openEditDialog(config)}>
                  <IconEdit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {!config.isSecret && config.value && (
                  <DropdownMenuItem onClick={() => copyToClipboard(config.value ?? "")}>
                    <IconCopy className="mr-2 h-4 w-4" />
                    Copy Value
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setHistoryConfigId(config.id);
                    setHistoryDialogOpen(true);
                  }}
                >
                  <IconHistory className="mr-2 h-4 w-4" />
                  View History
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => openDeleteConfirm(config)}
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
    [visibleSecrets, openEditDialog, openDeleteConfirm],
  );

  return (
    <>
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={onBack} size="icon" variant="ghost">
              <IconChevronLeft className="size-5" />
            </Button>
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <IconFolderCog className="h-5 w-5 text-primary" />
                {namespace.name}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {namespace.description || "Manage configurations in this namespace"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ServerDataTable
            columns={columns}
            data={configs}
            empty={{
              component: (
                <EmptyState
                  actionLabel={
                    q ? undefined : (
                      <>
                        <IconPlus className="h-4 w-4 mr-2" />
                        Add Config
                      </>
                    )
                  }
                  description={
                    q
                      ? `No configs found matching "${q}"`
                      : "Add your first configuration item to this namespace"
                  }
                  icon={IconSettings}
                  onAction={q ? undefined : () => setCreateDialogOpen(true)}
                  title={q ? "No Results" : "No Configs"}
                />
              ),
            }}
            filters={filters}
            isLoading={isPending}
            manualSorting
            onResetFilters={handleResetFilters}
            onSortingChange={setSorting}
            pagination={{
              page,
              pageSize,
              total,
              onPageChange: setPage,
              onPageSizeChange: setPageSize,
            }}
            search={{
              value: searchValue,
              onChange: setSearchValue,
              placeholder: "Search configs...",
            }}
            sorting={sorting}
            toolbarActions={
              <>
                <Dialog
                  onOpenChange={(open) => {
                    setCreateDialogOpen(open);
                    if (!open) resetForm();
                  }}
                  open={isCreateDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
                      <IconPlus className="h-4 w-4" />
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
                      description={formData.description}
                      isSecret={formData.isSecret}
                      keyValue={formData.key}
                      onDescriptionChange={(value) => updateFormData({ description: value })}
                      onIsSecretChange={(value) => updateFormData({ isSecret: value })}
                      onKeyChange={(value) => updateFormData({ key: value })}
                      onValueChange={(value) => updateFormData({ value })}
                      onValueTypeChange={(value) => updateFormData({ valueType: value })}
                      value={formData.value}
                      valueType={formData.valueType}
                    />
                    <DialogFooter>
                      <Button onClick={() => setCreateDialogOpen(false)} variant="outline">
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
                  <IconRefresh className={cn("h-4 w-4", isFetching ? "animate-spin" : "")} />
                </Button>
              </>
            }
          />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setEditDialogOpen(open);
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
            <DialogDescription>Update the configuration value.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <ConfigForm
              description={formData.description}
              isSecret={formData.isSecret}
              keyValue={formData.key}
              onDescriptionChange={(value) => updateFormData({ description: value })}
              onIsSecretChange={(value) => updateFormData({ isSecret: value })}
              onKeyChange={(value) => updateFormData({ key: value })}
              onValueChange={(value) => updateFormData({ value })}
              onValueTypeChange={(value) => updateFormData({ valueType: value })}
              value={formData.value}
              valueType={formData.valueType}
            />
            <div className="space-y-2">
              <Label htmlFor="change-reason">Change Reason (Optional)</Label>
              <Textarea
                className="bg-muted/50 min-h-[60px]"
                id="change-reason"
                onChange={(e) => updateFormData({ changeReason: e.target.value })}
                placeholder="Describe why you're making this change..."
                value={formData.changeReason}
              />
              <p className="text-xs text-muted-foreground">
                This reason will be recorded in the change history.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setEditDialogOpen(false);
                setEditingConfig(null);
                resetForm();
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

      {/* History Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setHistoryDialogOpen(open);
          if (!open) setHistoryConfigId(null);
        }}
        open={isHistoryDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconHistory className="size-5" />
              Change History
            </DialogTitle>
            <DialogDescription>
              View the history of changes for this configuration.
            </DialogDescription>
          </DialogHeader>
          {historyConfigId && <ConfigHistoryList configId={historyConfigId} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Config</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete config <strong>{configToDelete?.key}</strong>? This
              action cannot be undone.
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
          <Select
            onValueChange={(v) => onValueTypeChange(v as "string" | "number" | "boolean" | "json")}
            value={valueType}
          >
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
          <Select onValueChange={(v) => onValueChange(v ?? "")} value={value}>
            <SelectTrigger className="bg-muted/50">
              <SelectValue />
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
    return <div className="text-center py-8 text-muted-foreground">Failed to load history</div>;
  }

  const history = (data ?? []) as HistoryItem[];

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">No change history available</div>
    );
  }

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto">
      {history.map((item) => (
        <div className="rounded-lg border p-3 space-y-2" key={item.id}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconClock className="size-3" />
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
            <p className="text-xs text-muted-foreground italic">Reason: {item.changeReason}</p>
          )}
        </div>
      ))}
    </div>
  );
}
