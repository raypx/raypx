import { Separator } from "@raypx/ui/components/separator";

export function OrDivider() {
  return (
    <div className="relative">
      <Separator />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
        OR
      </span>
    </div>
  );
}
