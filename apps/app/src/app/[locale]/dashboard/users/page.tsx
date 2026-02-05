"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { rpc } from "@/utils/orpc";

export default function UsersListPage() {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfiniteQuery({
      queryKey: ["users", "infiniteList"],
      queryFn: async ({ pageParam }) => {
        const result = await rpc.users.infiniteList({
          limit: 10,
          cursor: pageParam as string | undefined,
        });
        return result;
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    });

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsIntersecting(true);
        } else {
          setIsIntersecting(false);
        }
      },
      { threshold: 0.1 },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  // Load more when intersecting
  useEffect(() => {
    if (isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [isIntersecting, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single array
  const allUsers = data?.pages.flatMap((page) => page.users ?? []) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage and view all users in your organization.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>Loading users...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div className="flex items-center gap-4" key={i}>
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage and view all users in your organization.</p>
        </div>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>Failed to load users</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error?.message || "An error occurred"}</p>
            <Button className="mt-4" onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-2xl tracking-tight">Users</h2>
        <p className="text-muted-foreground">
          Manage and view all users in your organization. Total: {allUsers.length} users
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>A list of all users in your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {allUsers.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No users found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {allUsers.map((user) => (
                <div className="flex items-center gap-4 border-b pb-4 last:border-0" key={user.id}>
                  <Avatar className="size-10">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback>{user.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{user.name || "Unknown"}</p>
                    <p className="truncate text-muted-foreground text-xs">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load more trigger */}
          <div className="mt-6" ref={loadMoreRef}>
            {isFetchingNextPage && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div className="flex items-center gap-4" key={i}>
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!hasNextPage && allUsers.length > 0 && (
              <div className="py-4 text-center">
                <p className="text-muted-foreground text-sm">You've reached the end of the list.</p>
              </div>
            )}

            {hasNextPage && !isFetchingNextPage && (
              <div className="py-4 text-center">
                <Button onClick={() => fetchNextPage()} type="button" variant="outline">
                  Load more
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
