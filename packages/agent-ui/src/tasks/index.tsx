import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";
import type { CloudTaskState } from "../model/cloud";

export function TaskProgress({
  title,
  goal,
  status,
  labels,
}: {
  title: string;
  goal: string;
  status: CloudTaskState;
  labels: Record<CloudTaskState, string>;
}) {
  return (
    <header className="agent-task-progress">
      <div>
        <h2>{title}</h2>
        <p className="agent-context">{goal}</p>
      </div>
      <StatusBadge
        label={labels[status]}
        tone={
          status === "completed"
            ? "success"
            : status === "review" || status === "waiting_input"
              ? "warning"
              : "neutral"
        }
      />
    </header>
  );
}
export function RevisionReview({
  revision,
  summary,
  accepted,
  pending = false,
  onAccept,
  labels,
}: {
  revision: number;
  summary: string;
  accepted: boolean;
  pending?: boolean;
  onAccept?: () => void;
  labels: { revision: string; accept: string; accepted: string; pending: string };
}) {
  return (
    <section className="agent-revision" aria-busy={pending}>
      <h3>
        {labels.revision} {revision}
      </h3>
      <p>{summary}</p>
      {accepted ? (
        <p role="status">{labels.accepted}</p>
      ) : onAccept ? (
        <Button disabled={pending} onClick={onAccept}>
          {pending ? labels.pending : labels.accept}
        </Button>
      ) : null}
    </section>
  );
}
