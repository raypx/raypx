import { useTRPC } from "@raypx/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/select";
import { toast } from "@raypx/ui/components/toast";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "~/components/data-table";
import { EmptyState } from "~/components/empty-state";
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
  const [sortBy, setSortBy] = useState<"createdAt" | "email" | "name">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const pageSize = 10;
  const usersQuery = useQuery({
    ...trpc.users.list.queryOptions(
      {
        q: query || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
        status: "all",
      },
      { staleTime: 30_000 },
    ),
    placeholderData: keepPreviousData,
  });
  const { data, isPending, isError, error, refetch, isFetching } = usersQuery;

  const users: UserListItem[] = useMemo(() => (data?.items ?? []) as UserListItem[], [data?.items]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let content: ReactNode;

  if (isError) {
    content = (
      <ErrorState
        message={error?.message ?? "Something went wrong while loading users."}
        onRetry={() => {
          void refetch();
        }}
        retrying={isFetching}
      />
    );
  } else if (users.length === 0) {
    content = <EmptyState description="No users found." icon={Users} title="No Users" />;
  } else {
    content = (
      <UsersTable
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
        users={users}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <CardTitle>All Users</CardTitle>
            <CardDescription>Latest user accounts and their current status.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-64">
              <Input
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search name or email..."
                value={searchValue}
              />
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
        </div>
      </CardHeader>
      <CardContent className="px-0">{content}</CardContent>
    </Card>
  );
}

function UsersTable({
  users,
  isLoading = false,
  page,
  pageCount,
  onPageChange,
  onChanged,
  onSortingChange,
}: {
  users: UserListItem[];
  isLoading?: boolean;
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  onChanged: () => void;
  onSortingChange?: (sorting: { id: string; desc: boolean } | null) => void;
}) {
  const trpc = useTRPC();

  const updateRole = useMutation(trpc.users.updateRole.mutationOptions());
  const setBanned = useMutation(trpc.users.setBanned.mutationOptions());
  const deleteUser = useMutation(trpc.users.delete.mutationOptions());

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);

  // Role state
  const [roleValue, setRoleValue] = useState<UserRole | "">("");
  // Ban state
  const [banReason, setBanReason] = useState("");
  const [banExpires, setBanExpires] = useState<string>("");

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
        onChanged();
      } catch (err) {
        toast.error(
          `Failed to update role: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [updateRole, onChanged],
  );

  const doToggleBan = useCallback(
    async (u: UserListItem) => {
      if (u.banned) {
        try {
          await setBanned.mutateAsync({ id: u.id, banned: false });
          toast.success("User unbanned successfully");
          onChanged();
        } catch (err) {
          toast.error(
            `Failed to unban user: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        }
        return;
      }
      openBanDialog(u);
    },
    [setBanned, onChanged, openBanDialog],
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
      onChanged();
      closeBanDialog();
    } catch (err) {
      toast.error(`Failed to ban user: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [selectedUser, banReason, banExpires, setBanned, onChanged, closeBanDialog]);

  const doDelete = useCallback(
    async (u: UserListItem) => {
      if (!window.confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
      try {
        await deleteUser.mutateAsync(u.id);
        toast.success("User deleted successfully");
        onChanged();
      } catch (err) {
        toast.error(
          `Failed to delete user: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [deleteUser, onChanged],
  );

  // Define columns
  const columns = useMemo<ColumnDef<UserListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
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
        header: "Email",
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
        header: "Created",
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
                  <MoreHorizontal className="h-4 w-4" />
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
                  onClick={() => void doDelete(user)}
                >
                  Delete User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [setBanned.isPending, deleteUser.isPending, doToggleBan, doDelete],
  );

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
                  <SelectValue placeholder="Select a role" />
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

      <div className="px-6 pb-2 space-y-3">
        <DataTable
          columns={columns}
          data={users}
          enableSorting
          initialSorting={{ id: "createdAt", desc: true }}
          isLoading={isLoading}
          manualSorting
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

export const Route = createFileRoute("/dashboard/users/")({
  component: AdminUsersPage,
});
