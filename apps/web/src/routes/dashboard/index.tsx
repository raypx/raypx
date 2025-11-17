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
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Clock,
  CreditCard,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

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
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Active Sessions",
      value: "573",
      change: "+4.3%",
      changeType: "increase" as const,
      icon: Activity,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Revenue",
      value: "$12,456",
      change: "+8.2%",
      changeType: "increase" as const,
      icon: CreditCard,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Growth",
      value: "+23%",
      change: "+2.1%",
      changeType: "increase" as const,
      icon: TrendingUp,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const quickActions = [
    {
      title: "Create API Key",
      description: "Generate a new API key",
      href: "/dashboard/api-keys",
      icon: Shield,
      color: "text-blue-500",
    },
    {
      title: "View Settings",
      description: "Manage your preferences",
      href: "/dashboard/settings",
      icon: Zap,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {session?.user?.name?.split(" ")[0] || "User"}!
          </h1>
          <p className="text-muted-foreground">Here's what's happening with your account today</p>
        </div>
        <Badge className="gap-2" variant="outline">
          <Clock className="h-3 w-3" />
          Last login: 2 hours ago
        </Badge>
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
            className="relative overflow-hidden transition-all hover:shadow-md hover:border-primary/50"
            key={stat.title}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <ArrowUpRight className="h-3 w-3" />
                <span>{stat.change} from last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks you might want to do</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Link key={action.href} to={action.href}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <action.icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your recent actions and updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div className="flex items-center gap-4" key={index}>
                  <div
                    className={`h-2 w-2 rounded-full ${statusColors[activity.status]} animate-pulse`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Health */}
      <Card>
        <CardHeader>
          <CardTitle>Account Health</CardTitle>
          <CardDescription>Keep your account secure and up to date</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Profile Completion</span>
              <span className="text-muted-foreground">85%</span>
            </div>
            <Progress className="h-2" value={85} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Security Score</span>
              <span className="text-muted-foreground">Good</span>
            </div>
            <Progress className="h-2" value={70} />
          </div>

          <div className="pt-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/settings">Complete Your Profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
