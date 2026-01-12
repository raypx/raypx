import { Avatar, AvatarFallback, AvatarImage } from "@raypx/ui/components/avatar";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/organization")({
  component: OrganizationSettings,
});

const mockMembers = [
  { id: "1", name: "John Doe", email: "john@example.com", role: "owner", image: null },
  { id: "2", name: "Jane Smith", email: "jane@example.com", role: "admin", image: null },
  { id: "3", name: "Bob Wilson", email: "bob@example.com", role: "member", image: null },
];

function OrganizationSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Manage your organization's basic information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input defaultValue="Acme Inc" id="org-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">URL Slug</Label>
              <Input defaultValue="acme" id="org-slug" />
              <p className="text-muted-foreground text-xs">raypx.com/org/acme</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <Button>Save changes</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Manage who has access to this organization.</CardDescription>
          </div>
          <Button size="sm">
            <IconPlus className="mr-2 size-4" />
            Invite Member
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockMembers.map((member) => (
              <div
                className="flex items-center justify-between rounded-lg border p-4"
                key={member.id}
              >
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={member.image || undefined} />
                    <AvatarFallback>{member.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{member.name}</p>
                    <p className="text-muted-foreground text-xs">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role}
                  </Badge>
                  {member.role !== "owner" && (
                    <Button size="sm" variant="ghost">
                      <IconTrash className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible and destructive actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Transfer Ownership</p>
              <p className="text-muted-foreground text-xs">
                Transfer this organization to another member.
              </p>
            </div>
            <Button variant="outline">Transfer</Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Delete Organization</p>
              <p className="text-muted-foreground text-xs">
                Permanently delete this organization and all its data.
              </p>
            </div>
            <Button variant="destructive">Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
