import { Separator } from "@raypx/ui/components/separator";

export function OrDivider() {
  return (
    <div className="relative">
      <Separator />
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-muted-foreground text-xs">
        OR
      </span>
    </div>
  );
}
