import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Settings, Users } from "lucide-react";

export const Route = createFileRoute("/_org/org/$orgSlug/")({
  component: OrgHomePage,
});

function OrgHomePage() {
  const { orgSlug } = Route.useParams();

  // TODO: Add org membership check here
  // For now, auth is handled by parent _org layout

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization: {orgSlug}</h1>
        <p className="text-muted-foreground">Manage your organization and team members</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members
            </CardTitle>
            <CardDescription>Team members in this organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">+3 this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity
            </CardTitle>
            <CardDescription>Recent organization activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">142</div>
            <p className="text-xs text-muted-foreground">events this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </CardTitle>
            <CardDescription>Organization configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">integrations active</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm">• Invite new members</p>
            <p className="text-sm">• Manage permissions</p>
            <p className="text-sm">• View billing</p>
            <p className="text-sm">• Export data</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
