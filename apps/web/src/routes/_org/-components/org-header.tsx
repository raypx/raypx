import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function OrgHeader() {
  const params = useParams({ from: "/_org" });
  const orgSlug = "orgSlug" in params ? params.orgSlug : "";

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Button asChild size="sm" variant="ghost">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
        <div className="h-6 w-px bg-border" />
        <Badge variant="outline">{orgSlug}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={`/org/${orgSlug}/settings`}>Organization Settings</Link>
        </Button>
      </div>
    </header>
  );
}
