"use client"

import { useSession } from "@raypx/auth/client"
import { Badge } from "@raypx/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { format } from "date-fns"
import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"
import Link from "next/link"

export default function ConsolePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  const user = session.user

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {user.name || user.email}!
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening with your account today.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            Last login: {format(new Date(), "MMM dd, yyyy 'at' h:mm a")}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Account Status
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <Badge
              variant={user.emailVerified ? "default" : "secondary"}
              className="mt-2"
            >
              {user.emailVerified ? "Verified" : "Unverified"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Age</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.floor(
                (Date.now() - new Date(user.createdAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              )}{" "}
              days
            </div>
            <p className="text-xs text-muted-foreground">
              Since {format(user.createdAt, "MMM dd, yyyy")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Session Status
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Online</div>
            <p className="text-xs text-muted-foreground">
              Expires {format(session.session.expiresAt, "MMM dd")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.role ? user.role : "User"}
            </div>
            <p className="text-xs text-muted-foreground">Role assigned</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/console/profile"
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4" />
                <span className="font-medium">Manage Profile</span>
              </div>
              <Badge variant="outline">Settings</Badge>
            </Link>

            <div className="flex items-center justify-between p-3 rounded-lg border opacity-50">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-4 w-4" />
                <span className="font-medium">View Analytics</span>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border opacity-50">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4" />
                <span className="font-medium">Security Settings</span>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Account Overview
            </CardTitle>
            <CardDescription>
              Your account information at a glance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{user.email}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">User ID:</span>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {user.id.slice(0, 8)}...
                </code>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Updated:</span>
                <span className="font-medium">
                  {format(user.updatedAt, "MMM dd, yyyy")}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Email Status:</span>
                <Badge variant={user.emailVerified ? "default" : "destructive"}>
                  {user.emailVerified ? "Verified" : "Not Verified"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
