import { ShellToolbar } from "@raypx/blocks/shell";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { cn } from "@raypx/ui/lib/utils";

export const conversationColumn = "mx-auto w-full min-w-0 max-w-[44rem] px-2 sm:px-3";

export function ConversationLoadingRows({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-10 w-2/5 rounded-2xl self-end" />
        <div className="flex w-4/5 flex-col gap-2.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
    </div>
  );
}

export function ConversationLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <ShellToolbar>
        <div
          aria-hidden="true"
          className="flex min-h-12 w-full min-w-0 flex-col justify-center gap-2 py-2 sm:flex-row sm:items-center sm:justify-start sm:gap-4"
        >
          <Skeleton className="h-4 w-28 max-w-full" />
          <div className="flex min-h-7 items-center gap-3">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </ShellToolbar>
      <div className={cn(conversationColumn, "min-h-0 flex-1 overflow-hidden pt-4 pb-6")}>
        <ConversationLoadingRows label={label} />
      </div>
      <div aria-hidden="true" className={cn(conversationColumn, "shrink-0 pb-3 sm:pb-4")}>
        <div className="flex h-24 flex-col justify-between rounded-3xl border border-border/80 bg-surface-panel p-3 shadow-soft sm:h-28">
          <Skeleton className="h-3.5 w-28 max-w-full" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="size-8 shrink-0 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
