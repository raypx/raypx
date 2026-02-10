import { IconLoader } from "@tabler/icons-react";
import { AuthCard } from "./card";

export function Loading() {
  return (
    <AuthCard>
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <IconLoader className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    </AuthCard>
  );
}
