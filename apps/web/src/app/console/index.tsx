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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import Container from "@/components/layout/container";

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

function ConsolePage() {
  return (
    <Container className="space-y-8 py-10">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Console</h1>
        <p className="text-muted-foreground text-sm">
          Review user accounts with live data retrieved through tRPC.
        </p>
      </section>
      <UsersSection />
    </Container>
  );
}

function UsersSection() {
  const trpc = useTRPC();
  const usersQuery = useQuery(
    trpc.users.list.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );
  const { data, isPending, isError, error, refetch, isFetching } = usersQuery;

  const users: UserListItem[] = (data ?? []) as UserListItem[];

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
    content = <UsersTable users={users} />;
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Users</CardTitle>
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

function UsersTable({ users }: { users: UserListItem[] }) {
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
            </TableRow>
          ))}
        </TableBody>
        <TableCaption>Showing {users.length} users</TableCaption>
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

export const Route = createFileRoute("/console/")({
  component: ConsolePage,
});
