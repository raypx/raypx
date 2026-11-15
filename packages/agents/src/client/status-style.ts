/** Visual roles only; lifecycle labels and decisions remain model-owned. */
export function statusStyle(status: string): string {
  switch (status) {
    case "running":
    case "starting":
    case "queued":
      return "rounded-md border border-info-border bg-info-bg px-1.5 py-0.5 text-info-text";
    case "waiting":
    case "stopping":
      return "rounded-md border border-warning-border bg-warning-bg px-1.5 py-0.5 text-warning-text";
    case "failed":
    case "refused":
      return "rounded-md border border-danger-border bg-danger-bg px-1.5 py-0.5 text-danger-text";
    case "succeeded":
    case "completed":
      return "rounded-md border border-success-border bg-success-bg px-1.5 py-0.5 text-success-text";
    default:
      return "rounded-md border border-border bg-muted px-1.5 py-0.5 text-muted-foreground";
  }
}
