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
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  toast,
} from "@raypx/ui/components";
import { cn } from "@raypx/ui/lib/utils";
import {
  IconDots,
  IconRefresh,
  IconShieldHeart,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconUserX,
} from "@tabler/icons-react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";

type UserRole = "user" | "admin" | "superadmin";

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string | null;
  createdAt: Date;
  banned: boolean | null;
  banReason: string | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDateTime = (value: Date | string | null | undefined) => {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return dateTimeFormatter.format(date);
};

function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(inputValue);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue]);

  return (
    <PageWrapper>
      <UsersSection onSearchChange={setInputValue} query={q} searchValue={inputValue} />
    </PageWrapper>
  );
}

function UsersSection({
  query,
  searchValue,
  onSearchChange,
}: {
  query: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState<"createdAt" | "email" | "name">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<UserListItem[]>([]);

  const usersQuery = useQuery({
    ...trpc.users.list.queryOptions(
      {
        q: query || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
        status:
          statusFilter.length === 1
            ? (statusFilter[0] as "active" | "banned")
            : statusFilter.length > 1
              ? undefined
              : "all",
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });
  const { data, isPending, isError, error, refetch, isFetching } = usersQuery;

  const users: UserListItem[] = useMemo(() => (data?.items ?? []) as UserListItem[], [data?.items]);
  const total = data?.total ?? 0;

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
    onSearchChange("");
    setStatusFilter([]);
    setPage(1);
  };

  // Status filter options
  const statusOptions = [
    {
      label: "Active",
      value: "active",
      icon: IconUser,
    },
    {
      label: "Banned",
      value: "banned",
      icon: IconShieldHeart,
    },
  ];

  // Mutations
  const updateRole = useMutation(trpc.users.updateRole.mutationOptions());
  const setBanned = useMutation(trpc.users.setBanned.mutationOptions());
  const deleteUser = useMutation(trpc.users.delete.mutationOptions());

  // Dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [roleValue, setRoleValue] = useState<UserRole | "">("");
  const [banReason, setBanReason] = useState("");
  const [banExpires, setBanExpires] = useState<string>("");
  // Delete confirm dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserListItem | null>(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const openRoleDialog = useCallback((user: UserListItem) => {
    setSelectedUser(user);
    setRoleValue((user.role as UserRole) || "");
    setRoleDialogOpen(true);
  }, []);

  const closeRoleDialog = useCallback(() => {
    setRoleDialogOpen(false);
    setSelectedUser(null);
    setRoleValue("");
  }, []);

  const openBanDialog = useCallback((user: UserListItem) => {
    setSelectedUser(user);
    setBanReason("");
    setBanExpires("");
    setBanDialogOpen(true);
  }, []);

  const closeBanDialog = useCallback(() => {
    setBanDialogOpen(false);
    setSelectedUser(null);
    setBanReason("");
    setBanExpires("");
  }, []);

  const doSetRole = useCallback(
    async (id: string, role: UserRole | null) => {
      try {
        await updateRole.mutateAsync({ id, role });
        toast.success("User role updated successfully");
        void refetch();
      } catch (err) {
        toast.error(
          `Failed to update role: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [updateRole, refetch],
  );

  const doToggleBan = useCallback(
    async (u: UserListItem) => {
      if (u.banned) {
        try {
          await setBanned.mutateAsync({ id: u.id, banned: false });
          toast.success("User unbanned successfully");
          void refetch();
        } catch (err) {
          toast.error(
            `Failed to unban user: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        }
        return;
      }
      openBanDialog(u);
    },
    [setBanned, refetch, openBanDialog],
  );

  const doBanUser = useCallback(async () => {
    if (!selectedUser) return;
    try {
      await setBanned.mutateAsync({
        id: selectedUser.id,
        banned: true,
        banReason: banReason || undefined,
        banExpires: banExpires ? new Date(banExpires) : undefined,
      });
      toast.success("User banned successfully");
      void refetch();
      closeBanDialog();
    } catch (err) {
      toast.error(`Failed to ban user: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [selectedUser, banReason, banExpires, setBanned, refetch, closeBanDialog]);

  const openDeleteConfirm = useCallback((u: UserListItem) => {
    setUserToDelete(u);
    setDeleteConfirmOpen(true);
  }, []);

  const doDelete = useCallback(async () => {
    if (!userToDelete) return;
    try {
      await deleteUser.mutateAsync(userToDelete.id);
      toast.success("User deleted successfully");
      void refetch();
      setSelectedRows([]);
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    } catch (err) {
      toast.error(`Failed to delete user: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [userToDelete, deleteUser, refetch]);

  // Bulk operations
  const doBulkDelete = useCallback(async () => {
    if (selectedRows.length === 0) return;
    try {
      await Promise.all(selectedRows.map((user) => deleteUser.mutateAsync(user.id)));
      toast.success(`${selectedRows.length} user(s) deleted successfully`);
      void refetch();
      setSelectedRows([]);
      setBulkDeleteConfirmOpen(false);
    } catch (err) {
      toast.error(
        `Failed to delete users: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [selectedRows, deleteUser, refetch]);

  const doBulkUpdateRole = useCallback(
    async (role: UserRole | null) => {
      if (selectedRows.length === 0) return;
      try {
        await Promise.all(
          selectedRows.map((user) => updateRole.mutateAsync({ id: user.id, role })),
        );
        toast.success(`Role updated for ${selectedRows.length} user(s)`);
        void refetch();
        setSelectedRows([]);
      } catch (err) {
        toast.error(
          `Failed to update roles: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [selectedRows, updateRole, refetch],
  );

  const doBulkBan = useCallback(async () => {
    if (selectedRows.length === 0) return;
    try {
      await Promise.all(
        selectedRows.map((user) => setBanned.mutateAsync({ id: user.id, banned: true })),
      );
      toast.success(`${selectedRows.length} user(s) banned successfully`);
      void refetch();
      setSelectedRows([]);
    } catch (err) {
      toast.error(`Failed to ban users: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [selectedRows, setBanned, refetch]);

  const doBulkUnban = useCallback(async () => {
    if (selectedRows.length === 0) return;
    try {
      await Promise.all(
        selectedRows.map((user) => setBanned.mutateAsync({ id: user.id, banned: false })),
      );
      toast.success(`${selectedRows.length} user(s) unbanned successfully`);
      void refetch();
      setSelectedRows([]);
    } catch (err) {
      toast.error(`Failed to unban users: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [selectedRows, setBanned, refetch]);

  // Define columns
  const columns = useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        enableSorting: true,
        cell: ({ row }) => {
          const user = row.original;
          const initials = (user.name || user.email || "U")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage alt={user.name || ""} src={user.image || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="font-medium">{user.name ?? "--"}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
        enableSorting: true,
        cell: ({ row }) => <div className="text-muted-foreground">{row.original.email}</div>,
      },
      {
        accessorKey: "role",
        header: "Role",
        enableSorting: false,
        cell: ({ row }) => {
          const role = row.original.role;
          if (!role) {
            return <div className="text-muted-foreground">--</div>;
          }
          const roleVariant =
            role === "superadmin" ? "destructive" : role === "admin" ? "default" : "secondary";
          const roleLabel =
            role === "superadmin" ? "Super Admin" : role === "admin" ? "Admin" : "User";
          return (
            <Badge variant={roleVariant as "default" | "secondary" | "destructive"}>
              {roleLabel}
            </Badge>
          );
        },
      },
      {
        accessorKey: "banned",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => {
          const user = row.original;
          return user.banned ? (
            <Badge title={user.banReason ?? undefined} variant="destructive">
              Banned
            </Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        enableSorting: true,
        cell: ({ row }) => <div>{formatDateTime(row.original.createdAt)}</div>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const user = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <IconDots className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Role</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openRoleDialog(user)}>
                  Update Role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={setBanned.isPending}
                  onClick={() => void doToggleBan(user)}
                >
                  {user.banned ? "Unban User" : "Ban User"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={deleteUser.isPending}
                  onClick={() => openDeleteConfirm(user)}
                >
                  Delete User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [setBanned.isPending, deleteUser.isPending, doToggleBan, doDelete, openRoleDialog],
  );

  if (isError) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <ErrorState
            message={error?.message ?? "Something went wrong while loading users."}
            onRetry={() => {
              void refetch();
            }}
            retrying={isFetching}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Update Role Dialog */}
      <Dialog onOpenChange={(open) => (open ? undefined : closeRoleDialog())} open={roleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Role</DialogTitle>
            <DialogDescription>
              Assign a new role to {selectedUser?.email ?? "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                onValueChange={(v) => setRoleValue(v as any)}
                value={roleValue || (selectedUser?.role as any) || ""}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeRoleDialog} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!selectedUser || updateRole.isPending}
              onClick={async () => {
                if (!selectedUser) return;
                await doSetRole(
                  selectedUser.id,
                  (roleValue || selectedUser.role || "user") as UserRole,
                );
                closeRoleDialog();
              }}
            >
              {updateRole.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog onOpenChange={(open) => (open ? undefined : closeBanDialog())} open={banDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              Set a ban reason and optional expiry for {selectedUser?.email ?? "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason</Label>
              <Input
                id="ban-reason"
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Optional reason"
                value={banReason}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ban-expires">Expires At</Label>
              <Input
                id="ban-expires"
                onChange={(e) => setBanExpires(e.target.value)}
                placeholder="Optional expiry"
                type="datetime-local"
                value={banExpires}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeBanDialog} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={!selectedUser || setBanned.isPending}
              onClick={doBanUser}
              variant="destructive"
            >
              {setBanned.isPending ? "Banning..." : "Ban User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirm Dialog */}
      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user <strong>{userToDelete?.email}</strong>? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void doDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm Dialog */}
      <AlertDialog onOpenChange={setBulkDeleteConfirmOpen} open={bulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Users</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedRows.length}</strong> user(s)? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void doBulkDelete()}
            >
              Delete {selectedRows.length} User(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">All Users</CardTitle>
            <CardDescription className="mt-1.5">
              Manage user accounts and permissions.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ServerDataTable
            columns={columns}
            data={users}
            enableSelection
            enableSorting
            filters={[
              {
                title: "Status",
                options: statusOptions,
                selectedValues: statusFilter,
                onSelectedValuesChange: (values) => {
                  setStatusFilter(values);
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
                onSearchChange(value);
                setPage(1);
              },
              placeholder: "Search users...",
            }}
            selectedRows={selectedRows}
            skeletonRows={5}
            sorting={sorting}
            toolbarActions={
              <div className="flex items-center gap-2">
                {selectedRows.length > 0 && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          <IconShieldHeart className="h-4 w-4 mr-2" />
                          Update Role ({selectedRows.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => void doBulkUpdateRole("user")}>
                          Set as User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void doBulkUpdateRole("admin")}>
                          Set as Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void doBulkUpdateRole("superadmin")}>
                          Set as Super Admin
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedRows.some((u) => !u.banned) && (
                      <Button onClick={() => void doBulkBan()} size="sm" variant="outline">
                        <IconUserX className="h-4 w-4 mr-2" />
                        Ban ({selectedRows.filter((u) => !u.banned).length})
                      </Button>
                    )}
                    {selectedRows.some((u) => u.banned) && (
                      <Button onClick={() => void doBulkUnban()} size="sm" variant="outline">
                        <IconUserCheck className="h-4 w-4 mr-2" />
                        Unban ({selectedRows.filter((u) => u.banned).length})
                      </Button>
                    )}
                    <Button
                      onClick={() => setBulkDeleteConfirmOpen(true)}
                      size="sm"
                      variant="destructive"
                    >
                      <IconTrash className="h-4 w-4 mr-2" />
                      Delete ({selectedRows.length})
                    </Button>
                  </>
                )}
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
              </div>
            }
          />
        </CardContent>
      </Card>
    </>
  );
}

export const Route = createFileRoute("/dashboard/users/")({
  component: AdminUsersPage,
});
