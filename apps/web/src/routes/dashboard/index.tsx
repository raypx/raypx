import { SecurityPanel, useAuth } from "@raypx/auth";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Progress } from "@raypx/ui/components/progress";
import {
  IconActivity,
  IconArrowUpRight,
  IconBolt,
  IconChevronRight,
  IconClock,
  IconCreditCard,
  IconShield,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();

  const stats = [
    {
      title: "Total Users",
      value: "2,845",
      change: "+12.5%",
      changeType: "increase" as const,
      icon: IconUsers,
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

  const quickActions = [
    {
      title: "Create API Key",
      description: "Generate a new API key",
      href: "/dashboard/api-keys",
      icon: IconShield,
      color: "text-blue-500",
    },
    {
      title: "View Settings",
      description: "Manage your preferences",
      href: "/dashboard/settings",
      icon: IconBolt,
      color: "text-purple-500",
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back,{" "}
            <span className="bg-linear-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {session?.user?.name?.split(" ")[0] || "User"}
            </span>
            !
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your account today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="gap-1.5 py-1.5 px-3" variant="secondary">
            <IconClock className="h-3.5 w-3.5" />
            Last login: 2 hours ago
          </Badge>
          <Button size="sm">
            <IconBolt className="mr-2 h-4 w-4" />
            Upgrade Plan
          </Button>
        </div>
      </div>

      {/* Security shortcuts (from @raypx/auth) */}
      <SecurityPanel
        changePasswordSearch={{ tab: "security" }}
        changePasswordTo="/_app/dashboard/settings/"
        forgotPasswordTo="/_auth/forgot-password"
        providers={["github", "google"]}
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            className="relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/20 group bg-card/50 backdrop-blur-sm"
            key={stat.title}
          >
            <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div
                className={`p-2 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform duration-300`}
              >
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
              <div className="flex items-center gap-2 mt-1">
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
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Recent Activity - Takes up more space */}
        <Card className="md:col-span-4 lg:col-span-5 flex flex-col bg-card/50 backdrop-blur-sm">
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
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />

              {recentActivity.map((activity, index) => (
                <div className="relative flex items-start gap-4 group" key={index}>
                  <div
                    className={`relative z-10 mt-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background shadow-xs transition-colors group-hover:border-primary group-hover:scale-110`}
                  >
                    <div className={`h-2 w-2 rounded-full ${statusColors[activity.status]}`} />
                  </div>
                  <div className="flex-1 space-y-1 bg-muted/30 p-3 rounded-lg group-hover:bg-muted/50 transition-colors">
                    <p className="text-sm font-medium leading-none">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions & Account Health - Side Column */}
        <div className="space-y-6 md:col-span-3 lg:col-span-2">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {quickActions.map((action) => (
                <Link key={action.href} to={action.href}>
                  <Button className="w-full justify-start h-auto py-3 px-4 group" variant="outline">
                    <div
                      className={`mr-3 p-1.5 rounded-md bg-primary/5 group-hover:bg-primary/10 transition-colors`}
                    >
                      <action.icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{action.title}</div>
                    </div>
                    <IconChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              ))}
              <Button className="w-full justify-start gap-3" variant="ghost">
                <div className="p-1.5">
                  <IconUsers className="h-4 w-4 text-muted-foreground" />
                </div>
                Invite Team Member
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Account Health</CardTitle>
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
              <Button asChild className="w-full text-xs" size="sm" variant="secondary">
                <Link to="/dashboard/settings">Complete Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
