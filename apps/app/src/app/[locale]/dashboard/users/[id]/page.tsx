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
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

interface UserDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: UserDetailPageProps) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const { data: session, isPending: sessionLoading } = useSession();

  // Resolve params
  useEffect(() => {
    params.then((resolvedParams) => setUserId(resolvedParams.id));
  }, [params]);

  // Example 1: Dependent query - only fetch user if userId is available
  const { data: userDetails, isLoading: userLoading } = useQuery(
    orpc.users.getById.queryOptions({ input: { id: userId ?? "" } }),
  );

  // Example 2: Conditional query - only fetch admin stats if user is authenticated
  const { data: adminStats, isLoading: adminLoading } = useQuery({
    ...orpc.users.getAdminStats.queryOptions(),
    enabled: !!session?.user, // Only run when user is authenticated
  });

  // Example 3: Role-based conditional query - only fetch for admins
  const { data: roleBasedData } = useQuery({
    ...orpc.users.stats.queryOptions(),
    enabled: session?.user?.email?.endsWith("@admin.com") ?? false, // Only for admin users
  });

  const isAdmin = adminStats?.isAdmin ?? false;

  if (sessionLoading || !userId) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">User Details</h2>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userDetails && !userLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">User Details</h2>
          <p className="text-muted-foreground">User not found</p>
        </div>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">User Not Found</CardTitle>
            <CardDescription>The requested user could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.back()} variant="outline">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">User Details</h2>
          <p className="text-muted-foreground">View and manage user information.</p>
        </div>
        <Button onClick={() => router.back()} variant="outline">
          Back to Users
        </Button>
      </div>

      {userLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <Skeleton className="size-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
            <CardDescription>Detailed information about this user.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="size-20">
                <AvatarImage src={userDetails?.image || undefined} />
                <AvatarFallback className="text-2xl">
                  {userDetails?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <h3 className="font-semibold text-xl">{userDetails?.name || "Unknown"}</h3>
                <p className="text-muted-foreground">{userDetails?.email}</p>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span>
                    Joined:{" "}
                    {userDetails?.createdAt
                      ? new Date(userDetails.createdAt).toLocaleDateString()
                      : "Unknown"}
                  </span>
                  {userDetails?.emailVerified && <span className="text-green-600">Verified</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin-only section - demonstrates role-based conditional queries */}
      {adminLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin Panel</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin Panel</CardTitle>
            <CardDescription>Administrative controls and statistics.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="font-medium text-sm">Total Users</p>
                <p className="font-bold text-2xl">{adminStats?.totalUsers ?? 0}</p>
              </div>
              <div>
                <p className="mb-2 font-medium text-sm">Available Actions</p>
                <div className="flex flex-wrap gap-2">
                  {adminStats?.adminActions.map((action: string) => (
                    <Button key={action} size="sm" variant="outline">
                      {action}
                    </Button>
                  ))}
                </div>
              </div>
              {roleBasedData && (
                <div>
                  <p className="font-medium text-sm">Role-Based Data (Admin Only)</p>
                  <p className="text-muted-foreground text-sm">
                    Total: {roleBasedData.total} | New: {roleBasedData.newUsers}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Admin Panel</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              You don't have permission to view admin panel.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Example: Avoiding waterfall requests */}
      <Card>
        <CardHeader>
          <CardTitle>Optimized Queries</CardTitle>
          <CardDescription>This page demonstrates dependent query optimization:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li>• User details query only runs when userId is available (enabled: !!userId)</li>
            <li>
              • Admin stats query only runs when user is authenticated (enabled: !!session?.user)
            </li>
            <li>
              • Role-based data query only runs for admin users (enabled:
              user?.email?.endsWith(&quot;@admin.com&quot;))
            </li>
            <li>• All conditional queries are defined but only execute when conditions are met</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// Add useState import
import { useState } from "react";
