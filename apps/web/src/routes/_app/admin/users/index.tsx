import { useTRPC } from "@raypx/trpc/client";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardAction,
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
import { Skeleton } from "@raypx/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/table";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Review and manage all user accounts with live data retrieved through tRPC.
          </p>
        </div>
        <div className="w-72">
          <Input
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email..."
            value={q}
          />
        </div>
      </div>
      <UsersSection query={q} />
    </div>
  );
}

function UsersSection({ query }: { query: string }) {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const usersQuery = useQuery({
    ...trpc.users.list.queryOptions(
      {
        q: query || undefined,
        page,
        pageSize,
        sortBy: "createdAt",
        sortOrder: "desc",
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

  if (isPending) {
    content = <UsersTableSkeleton />;
  } else if (isError) {
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
    content = <EmptyState />;
  } else {
    content = (
      <UsersTable
        onChanged={() => {
          void refetch();
        }}
        onPageChange={(p) => {
          setPage(p);
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
        <CardTitle>All Users</CardTitle>
        <CardDescription>Latest user accounts and their current status.</CardDescription>
        <CardAction>
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

function UsersTable({
  users,
  page,
  pageCount,
  onPageChange,
  onChanged,
}: {
  users: UserListItem[];
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const updateRole = useMutation(trpc.users.updateRole.mutationOptions());
  const setBanned = useMutation(trpc.users.setBanned.mutationOptions());
  const deleteUser = useMutation(trpc.users.delete.mutationOptions());

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);

  // Role state
  const [roleValue, setRoleValue] = useState<"user" | "admin" | "superadmin" | "">("");
  // Ban state
  const [banReason, setBanReason] = useState("");
  const [banExpires, setBanExpires] = useState<string>("");

  const doSetRole = async (id: string, role: "user" | "admin" | "superadmin" | null) => {
    await updateRole.mutateAsync({ id, role });
    onChanged();
  };
  const doToggleBan = async (u: UserListItem) => {
    if (u.banned) {
      await setBanned.mutateAsync({ id: u.id, banned: false });
      onChanged();
      return;
    }
    setSelectedUser(u);
    setBanReason("");
    setBanExpires("");
    setBanDialogOpen(true);
  };
  const doDelete = async (u: UserListItem) => {
    if (!window.confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    await deleteUser.mutateAsync(u.id);
    onChanged();
  };

  return (
    <div className="px-6 pb-2 space-y-3">
      {/* Update Role Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setRoleDialogOpen(open);
          if (!open) {
            setSelectedUser(null);
            setRoleValue("");
          }
        }}
        open={roleDialogOpen}
      >
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
            <Button
              onClick={() => {
                setRoleDialogOpen(false);
                setSelectedUser(null);
                setRoleValue("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedUser || updateRole.isPending}
              onClick={async () => {
                if (!selectedUser) return;
                await doSetRole(
                  selectedUser.id,
                  (roleValue || selectedUser.role || "user") as "user" | "admin" | "superadmin",
                );
                setRoleDialogOpen(false);
              }}
            >
              {updateRole.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog
        onOpenChange={(open) => {
          setBanDialogOpen(open);
          if (!open) {
            setSelectedUser(null);
            setBanReason("");
            setBanExpires("");
          }
        }}
        open={banDialogOpen}
      >
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
            <Button
              onClick={() => {
                setBanDialogOpen(false);
                setSelectedUser(null);
                setBanReason("");
                setBanExpires("");
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedUser || setBanned.isPending}
              onClick={async () => {
                if (!selectedUser) return;
                await setBanned.mutateAsync({
                  id: selectedUser.id,
                  banned: true,
                  banReason: banReason || undefined,
                  banExpires: banExpires ? new Date(banExpires) : undefined,
                });
                onChanged();
                setBanDialogOpen(false);
              }}
              variant="destructive"
            >
              {setBanned.isPending ? "Banning..." : "Ban User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name ?? "--"}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>{user.role ?? "--"}</TableCell>
              <TableCell>
                {user.banned ? (
                  <Badge title={user.banReason ?? undefined} variant="destructive">
                    Banned
                  </Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </TableCell>
              <TableCell>{formatDateTime(user.createdAt)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Manage
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Role</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedUser(user);
                        setRoleValue((user.role as any) || "");
                        setRoleDialogOpen(true);
                      }}
                    >
                      Update Role…
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableCaption>
          <div className="flex items-center justify-between">
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
        </TableCaption>
      </Table>
    </div>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="px-6 pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-12 text-center text-muted-foreground text-sm">No users found.</div>
  );
}

function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm">
      <p className="text-destructive">{message}</p>
      <Button disabled={retrying} onClick={onRetry} size="sm" variant="outline">
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/users/")({
  component: AdminUsersPage,
  beforeLoad: ({ context }) => {
    // Admin-only route
    // Access control is handled by the _app layout and tRPC procedures
  },
});
