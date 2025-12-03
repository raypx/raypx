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
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Activity, CheckCircle2, Copy, Key, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { DataTable } from "~/components/data-table";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { formatDate } from "~/lib/dashboard-utils";

dayjs.extend(relativeTime);

type ApiKeyListItem = {
  id: string;
  name: string | null;
  prefix: string;
  key: string;
  enabled: boolean;
  createdAt: Date;
  lastRequest: Date | null;
  requestCount: number;
  remaining: number | null;
  expiresAt: Date | null;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitTimeWindow: number;
};

const formatLastUsed = (date: Date | string | null | undefined) => {
  if (!date) return "Never";
  return dayjs(date).fromNow();
};

export const Route = createFileRoute("/dashboard/api-keys/")({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor your programmatic access keys
          </p>
        </div>
      </div>

      <ApiUsageStats />

      <div className="space-y-4">
        <ApiKeysSection />
      </div>
    </div>
  );
}

function ApiUsageStats() {
  const trpc = useTRPC();
  const { data: stats } = useQuery(
    trpc.apiKeys.stats.queryOptions(undefined, { staleTime: 30_000 }),
  );

  const usageStats = [
    {
      title: "Total Requests",
      value: (stats?.totalRequests ?? 0).toLocaleString(),
      icon: Activity,
      description: "All time usage",
    },
    {
      title: "Active Keys",
      value: stats?.activeKeys ?? 0,
      icon: CheckCircle2,
      description: "Currently enabled",
    },
    {
      title: "Total Keys",
      value: stats?.totalKeys ?? 0,
      icon: Key,
      description: "Created keys",
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

function ApiKeysSection() {
  const trpc = useTRPC();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "lastRequest" | "requestCount">(
    "createdAt",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const pageSize = 10;

  const apiKeysQuery = useQuery({
    ...trpc.apiKeys.list.queryOptions(
      {
        page,
        pageSize,
        sortBy,
        sortOrder,
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });

  const { data, isPending, isError, error, refetch, isFetching } = apiKeysQuery;

  const apiKeys: ApiKeyListItem[] = useMemo(
    () => (data?.items ?? []) as ApiKeyListItem[],
    [data?.items],
  );
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Create API key mutation
  const createKeyMutation = useMutation({
    ...trpc.apiKeys.create.mutationOptions(),
    onSuccess: (data) => {
      setNewlyCreatedKey(data.key);
      setNewKeyName("");
      void refetch();
      toast.success("API key created successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create API key");
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a key name");
      return;
    }
    createKeyMutation.mutate({ name: newKeyName.trim() });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (_error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading API keys."}
        onRetry={() => {
          void refetch();
        }}
        retrying={isFetching}
      />
    );
  } else if (apiKeys.length === 0) {
    content = (
      <EmptyState
        actionLabel={
          <>
            <Plus className="h-4 w-4 mr-2" />
            Create API Key
          </>
        }
        description="Create your first API key to get started"
        icon={Key}
        onAction={() => setIsCreateDialogOpen(true)}
        title="No API Keys"
      />
    );
  } else {
    content = (
      <ApiKeysTable
        apiKeys={apiKeys}
        isLoading={isPending}
        onChanged={() => {
          void refetch();
        }}
        onPageChange={(p) => {
          setPage(p);
        }}
        onSortingChange={(sorting) => {
          if (sorting) {
            setSortBy(sorting.id as typeof sortBy);
            setSortOrder(sorting.desc ? "desc" : "asc");
          }
        }}
        page={page}
        pageCount={totalPages}
      />
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5 text-primary" />
            Active Keys
          </CardTitle>
          <CardDescription className="mt-1.5">
            View and manage your API keys. Treat these keys like passwords.
          </CardDescription>
        </div>
        <Dialog
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) {
              // Reset form state when dialog closes
              setNewlyCreatedKey(null);
              setNewKeyName("");
            }
          }}
          open={isCreateDialogOpen}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg shadow-primary/20" size="sm">
              <Plus className="h-4 w-4" />
              Create New Key
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for your application. Keys are used to authenticate requests.
              </DialogDescription>
            </DialogHeader>

            {newlyCreatedKey ? (
              <div className="space-y-6 py-2">
                <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-medium">API Key Created Successfully</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2.5 bg-background rounded-lg text-xs border font-mono shadow-sm">
                      {newlyCreatedKey}
                    </code>
                    <Button
                      className="shrink-0"
                      onClick={() => copyToClipboard(newlyCreatedKey)}
                      size="icon"
                      variant="outline"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setNewlyCreatedKey(null);
                    setIsCreateDialogOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      className="bg-muted/50"
                      id="key-name"
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production Server"
                      value={newKeyName}
                    />
                    <p className="text-xs text-muted-foreground">
                      Give your key a descriptive name to identify its usage
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setNewKeyName("");
                      setNewlyCreatedKey(null);
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button disabled={createKeyMutation.isPending} onClick={handleCreateKey}>
                    {createKeyMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">{content}</CardContent>
    </Card>
  );
}

function ApiKeysTable({
  apiKeys,
  isLoading = false,
  onChanged,
  onPageChange,
  onSortingChange,
  page,
  pageCount,
}: {
  apiKeys: ApiKeyListItem[];
  isLoading?: boolean;
  onChanged: () => void;
  onPageChange: (p: number) => void;
  onSortingChange?: (sorting: { id: string; desc: boolean } | null) => void;
  page: number;
  pageCount: number;
}) {
  const trpc = useTRPC();
  const deleteKeyMutation = useMutation({
    ...trpc.apiKeys.delete.mutationOptions(),
    onSuccess: () => {
      onChanged();
      toast.success("API key deleted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete API key");
    },
  });

  const handleDeleteKey = (id: string) => {
    deleteKeyMutation.mutate(id);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (_error) {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Define columns
  const columns = useMemo<ColumnDef<ApiKeyListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => <div className="font-medium">{row.original.name || "Untitled Key"}</div>,
      },
      {
        accessorKey: "key",
        header: "Key",
        enableSorting: false,
        cell: ({ row }) => (
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{row.original.key}</code>
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
        accessorKey: "lastRequest",
        header: "Last Used",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatLastUsed(row.original.lastRequest)}
          </div>
        ),
      },
      {
        accessorKey: "requestCount",
        header: "Requests",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm">{row.original.requestCount.toLocaleString()}</div>
        ),
      },
      {
        accessorKey: "enabled",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "default" : "secondary"}>
            {row.original.enabled ? "Active" : "Disabled"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const apiKey = row.original;
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
                <DropdownMenuItem
                  onClick={() => {
                    void copyToClipboard(apiKey.key);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={deleteKeyMutation.isPending}
                  onClick={() => {
                    handleDeleteKey(apiKey.id);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Key
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [deleteKeyMutation.isPending, handleDeleteKey],
  );

  const [selectedRows, setSelectedRows] = useState<ApiKeyListItem[]>([]);

  return (
    <>
      {selectedRows.length > 0 && (
        <div className="px-6 py-2 bg-muted border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""} selected
            </span>
            <Button
              disabled={deleteKeyMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete ${selectedRows.length} API key${selectedRows.length !== 1 ? "s" : ""}?`,
                  )
                ) {
                  selectedRows.forEach((key) => {
                    deleteKeyMutation.mutate(key.id);
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
      <div className="px-6 pb-2 space-y-3">
        <DataTable
          columns={columns}
          data={apiKeys}
          enableSelection
          enableSorting
          initialSorting={{ id: "createdAt", desc: true }}
          isLoading={isLoading}
          manualSorting
          onSelectionChange={setSelectedRows}
          onSortingChange={onSortingChange}
        />
        <div className="flex items-center justify-between px-6 py-2 border-t">
          <div>
            Page {page} of {pageCount}
          </div>
          <div className="space-x-2">
            <Button
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              size="sm"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              disabled={page >= pageCount}
              onClick={() => onPageChange(Math.min(pageCount, page + 1))}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
