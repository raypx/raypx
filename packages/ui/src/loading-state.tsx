import { Skeleton } from "./components/ui/skeleton";

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-5 py-8">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16" />
        ))}
      </div>
    </div>
  );
}
