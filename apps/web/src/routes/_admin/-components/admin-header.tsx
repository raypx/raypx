import { useAuth } from "@raypx/auth";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import { Bell } from "lucide-react";

export function AdminHeader() {
  const { user } = useAuth();

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Badge variant="destructive">Admin Mode</Badge>
        <span className="text-sm text-muted-foreground">
          Logged in as {user?.name} ({user?.role})
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Button size="icon" variant="ghost">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
