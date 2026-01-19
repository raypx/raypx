import { ActivityIcon, ChartBarIcon, CreditCardIcon, UsersIcon } from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { data: session } = useSession();
  const { data: userStats, isLoading: isLoadingUsers } = useQuery<{
    total: number;
    change: number;
  }>(orpc.users.stats.queryOptions());

  const stats = [
    {
      title: "Total Users",
      value: userStats?.total ?? 0,
      change: `+${userStats?.change ?? 0}%`,
      icon: UsersIcon,
      loading: isLoadingUsers,
    },
    {
      title: "Revenue",
      value: "$12,345",
      change: "+8%",
      icon: CreditCardIcon,
      loading: false,
    },
    {
      title: "Active Sessions",
      value: "567",
      change: "+23%",
      icon: ActivityIcon,
      loading: false,
    },
    {
      title: "Conversion Rate",
      value: "3.2%",
      change: "+2%",
      icon: ChartBarIcon,
      loading: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-2xl tracking-tight">
          Welcome back, {session?.user?.name || "User"}!
        </h2>
        <p className="text-muted-foreground">Here's what's happening with your account today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-sm">{stat.title}</CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stat.loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-bold text-2xl">{stat.value}</div>
              )}
              <p className="text-muted-foreground text-xs">
                <span className="text-green-500">{stat.change}</span> from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest actions and events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div className="flex items-center gap-4" key={i}>
                  <div className="size-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Activity item {i}</p>
                    <p className="text-muted-foreground text-xs">
                      {i} hour{i > 1 ? "s" : ""} ago
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to do</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <button
                className="w-full rounded-md border p-3 text-left hover:bg-accent"
                type="button"
              >
                <p className="font-medium text-sm">Invite team member</p>
                <p className="text-muted-foreground text-xs">Add someone to your organization</p>
              </button>
              <button
                className="w-full rounded-md border p-3 text-left hover:bg-accent"
                type="button"
              >
                <p className="font-medium text-sm">View billing</p>
                <p className="text-muted-foreground text-xs">Manage your subscription</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
