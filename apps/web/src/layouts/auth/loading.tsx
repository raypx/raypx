import { IconLoader2 } from "@tabler/icons-react";
import { AuthCard } from "./card";

export function Loading() {
  return (
    <AuthCard>
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <IconLoader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    </AuthCard>
  );
}
