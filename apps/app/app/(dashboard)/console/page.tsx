"use client"

import { useSession } from "@raypx/auth/client"
import { Badge } from "@raypx/ui/components/badge"
import { format } from "date-fns"
import {
  Activity,
  BarChart3,
  Calendar,
  Settings,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  ConsoleGrid,
  ConsoleSection,
  DashboardActionLink,
  DashboardStatCard,
  DashboardWelcome,
} from "@/layouts/console"

export default function ConsolePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  const user = session.user

  return (
    <div className="space-y-8">
      <DashboardWelcome />

      <ConsoleGrid cols={2} lgCols={4} gap={4}>
        <DashboardStatCard
          title="Account Status"
          value="Active"
          icon={Shield}
          badge={{
            text: user.emailVerified ? "Verified" : "Unverified",
            variant: user.emailVerified ? "default" : "secondary",
          }}
        />

        <DashboardStatCard
          title="Account Age"
          value={`${Math.floor(
            (Date.now() - new Date(user.createdAt).getTime()) /
              (1000 * 60 * 60 * 24),
          )} days`}
          icon={Calendar}
          subtitle={`Since ${format(user.createdAt, "MMM dd, yyyy")}`}
        />

        <DashboardStatCard
          title="Session Status"
          value="Online"
          icon={Activity}
          subtitle={`Expires ${format(session.session.expiresAt, "MMM dd")}`}
        />

        <DashboardStatCard
          title="Profile"
          value={user.role || "User"}
          icon={Users}
          subtitle="Role assigned"
        />
      </ConsoleGrid>

      <ConsoleGrid cols={1} lgCols={2}>
        <ConsoleSection
          title="Quick Actions"
          description="Common tasks and settings"
          icon={Settings}
        >
          <div className="space-y-3">
            <DashboardActionLink
              href="/profile"
              icon={Users}
              title="Manage Profile"
              badge={{ text: "Settings", variant: "outline" }}
            />

            <DashboardActionLink
              href="/analytics"
              icon={BarChart3}
              title="View Analytics"
              badge={{ text: "Coming Soon", variant: "secondary" }}
              disabled
            />

            <DashboardActionLink
              href="/security"
              icon={Shield}
              title="Security"
              badge={{ text: "Coming Soon", variant: "secondary" }}
              disabled
            />
          </div>
        </ConsoleSection>

        <ConsoleSection
          title="Account Overview"
          description="Your account information at a glance"
          icon={TrendingUp}
        >
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
        </ConsoleSection>
      </ConsoleGrid>
    </div>
  )
}
