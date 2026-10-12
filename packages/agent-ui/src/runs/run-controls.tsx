import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { isRunTerminal, type RunStatus } from "../model";

export interface RunControlsProps {
  status: RunStatus;
  cancelPending?: boolean;
  retryPending?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  labels: {
    status: Record<RunStatus, string>;
    cancel: string;
    cancelling: string;
    retry: string;
    retrying: string;
  };
}
export function RunControls({
  status,
  cancelPending = false,
  retryPending = false,
  onCancel,
  onRetry,
  labels,
}: RunControlsProps) {
  return (
    <div className="agent-actions">
      <StatusBadge
        label={labels.status[status]}
        tone={status === "failed" ? "danger" : "neutral"}
      />
      {!isRunTerminal(status) && onCancel ? (
        <Button variant="outline" disabled={cancelPending} onClick={onCancel}>
          {cancelPending ? labels.cancelling : labels.cancel}
        </Button>
      ) : null}
      {(status === "failed" || status === "cancelled") && onRetry ? (
        <Button variant="outline" disabled={retryPending} onClick={onRetry}>
          {retryPending ? labels.retrying : labels.retry}
        </Button>
      ) : null}
    </div>
  );
}
