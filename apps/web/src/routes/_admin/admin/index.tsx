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
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Building2,
  Database,
  Server,
  TrendingUp,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const adminStats = [
    {
      title: "Total Users",
      value: "12,845",
      change: "+245 this week",
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      trend: "+12.5%",
    },
    {
      title: "Organizations",
      value: "234",
      change: "+12 this week",
      icon: Building2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      trend: "+5.2%",
    },
    {
      title: "Active Sessions",
      value: "1,573",
      change: "342 online now",
      icon: Activity,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      trend: "+8.1%",
    },
    {
      title: "Reported Issues",
      value: "23",
      change: "5 unresolved",
      icon: AlertTriangle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      trend: "-3.4%",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
          <p className="text-muted-foreground">System-wide statistics and management</p>
        </div>
        <Badge className="text-xs" variant="destructive">
          Admin Access
        </Badge>
      </div>

      {/* Admin Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {adminStats.map((stat) => (
          <Card
            className="relative overflow-hidden transition-all hover:shadow-md"
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
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{stat.change}</p>
                <div
                  className={`flex items-center gap-1 text-xs ${
                    stat.trend.startsWith("+")
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${stat.trend.startsWith("-") ? "rotate-180" : ""}`}
                  />
                  <span>{stat.trend}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent User Registrations</CardTitle>
            <CardDescription>Latest users who signed up</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: "Alice Johnson", email: "alice@example.com", time: "5 min ago" },
                { name: "Bob Smith", email: "bob@example.com", time: "12 min ago" },
                { name: "Carol White", email: "carol@example.com", time: "1 hour ago" },
              ].map((user) => (
                <div
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  key={user.email}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
                      {user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{user.time}</span>
                </div>
              ))}
            </div>
            <Button className="w-full mt-4" variant="outline">
              View All Users
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Current system status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Database className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="text-sm font-medium">Database</span>
                </div>
                <Badge
                  className="bg-green-500/10 text-green-600 dark:text-green-400"
                  variant="secondary"
                >
                  Healthy
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Server className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="text-sm font-medium">Redis Cache</span>
                </div>
                <Badge
                  className="bg-green-500/10 text-green-600 dark:text-green-400"
                  variant="secondary"
                >
                  Healthy
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Activity className="h-4 w-4 text-green-500" />
                  </div>
                  <span className="text-sm font-medium">Email Service</span>
                </div>
                <Badge
                  className="bg-green-500/10 text-green-600 dark:text-green-400"
                  variant="secondary"
                >
                  Healthy
                </Badge>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Response Time</span>
                <span className="font-medium text-green-600 dark:text-green-400">45ms</span>
              </div>
              <Progress className="h-1 mt-2" value={15} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
