import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Icon } from "@raypx/ui/components/icon";
import { Progress } from "@raypx/ui/components/progress";
import { cn } from "@raypx/ui/lib/utils";
import {
  IconActivity,
  IconArrowUpRight,
  IconClock,
  IconCreditCard,
  IconRobot,
  IconTrendingUp,
  IconUser,
} from "@tabler/icons-react";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { getUser } from "~/functions/get-user";

export const Route = createFileRoute("/dashboard/")({
  loader: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/sign-in",
      });
    }
    return { session };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = useLoaderData({ from: "/dashboard/" });

  const stats = [
    {
      title: "Total Users",
      value: "2,845",
      change: "+12.5%",
      changeType: "increase" as const,
      icon: IconUser,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Sessions",
      value: "573",
      change: "+4.3%",
      changeType: "increase" as const,
      icon: IconActivity,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Revenue",
      value: "$12,456",
      change: "+8.2%",
      changeType: "increase" as const,
      icon: IconCreditCard,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Growth",
      value: "+23%",
      change: "+2.1%",
      changeType: "increase" as const,
      icon: IconTrendingUp,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const recentActivity = [
    {
      action: "Profile updated",
      time: "2 hours ago",
      status: "success" as const,
    },
    {
      action: "New API key created",
      time: "1 day ago",
      status: "info" as const,
    },
    {
      action: "Password changed",
      time: "3 days ago",
      status: "warning" as const,
    },
    {
      action: "Email verified",
      time: "5 days ago",
      status: "success" as const,
    },
  ];

  const statusColors = {
    success: "bg-green-500",
    info: "bg-blue-500",
    warning: "bg-orange-500",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">
            Welcome back,{" "}
            <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {session?.user?.name?.split(" ")[0] || "User"}
            </span>
            !
          </h1>
          <p className="mt-1 text-muted-foreground">
            Here's what's happening with your account today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="gap-1.5 px-3 py-1.5" variant="secondary">
            <IconClock className="h-3.5 w-3.5" />
            Last login: 2 hours ago
          </Badge>
          <Button size="sm">
            <IconRobot className="mr-2 h-4 w-4" />
            Upgrade Plan
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            className="group relative overflow-hidden bg-card/50 backdrop-blur-sm transition-all hover:border-primary/20 hover:shadow-lg"
            key={stat.title}
          >
            <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-primary/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-muted-foreground text-sm">
                {stat.title}
              </CardTitle>
              <div
                className={cn(
                  "rounded-xl p-2",
                  stat.bgColor,
                  "transition-transform duration-300 group-hover:scale-110",
                )}
              >
                <Icon className={cn("h-4 w-4", stat.color)} icon={stat.icon} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl tracking-tight">{stat.value}</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  className="gap-1 font-normal"
                  variant={stat.changeType === "increase" ? "default" : "destructive"}
                >
                  {stat.changeType === "increase" ? (
                    <IconArrowUpRight className="h-3 w-3" />
                  ) : (
                    <IconArrowUpRight className="h-3 w-3 rotate-90" />
                  )}
                  {stat.change}
                </Badge>
                <span className="text-muted-foreground text-xs">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Recent Activity - Takes up more space */}
        <Card className="flex flex-col bg-card/50 backdrop-blur-sm md:col-span-4 lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your recent actions and updates</CardDescription>
              </div>
              <Button size="sm" variant="outline">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="relative space-y-6 pl-2">
              {/* Timeline Line */}
              <div className="absolute top-2 bottom-2 left-2 w-px bg-border" />

              {recentActivity.map((activity, index) => (
                <div className="group relative flex items-start gap-4" key={index}>
                  <div className="relative z-10 mt-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background shadow-xs transition-colors group-hover:scale-110 group-hover:border-primary">
                    <div className={cn("h-2 w-2 rounded-full", statusColors[activity.status])} />
                  </div>
                  <div className="flex-1 space-y-1 rounded-lg bg-muted/30 p-3 transition-colors group-hover:bg-muted/50">
                    <p className="font-medium text-sm leading-none">{activity.action}</p>
                    <p className="text-muted-foreground text-xs">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account Health - Side Column */}
        <div className="space-y-6 md:col-span-3 lg:col-span-2">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-medium text-sm">Account Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Profile Completion</span>
                  <span className="font-medium">85%</span>
                </div>
                <Progress className="h-1.5" value={85} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Security Score</span>
                  <span className="font-medium text-green-600">Good</span>
                </div>
                <Progress className="h-1.5" value={70} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
