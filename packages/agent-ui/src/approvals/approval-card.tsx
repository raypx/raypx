import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";
import type { ApprovalView } from "../model";

export interface ApprovalCardProps {
  approval: ApprovalView;
  pending?: boolean;
  disabledReason?: string;
  onDecision?: (id: string, decision: "approve" | "deny") => void;
  labels: {
    title: string;
    approve: string;
    deny: string;
    pending: string;
    approved: string;
    denied: string;
  };
}
export function ApprovalCard({
  approval,
  pending = false,
  disabledReason,
  onDecision,
  labels,
}: ApprovalCardProps) {
  return (
    <section className="agent-approval" aria-label={labels.title}>
      <strong>{labels.title}</strong>
      <p>{approval.prompt}</p>
      {approval.decision ? (
        <StatusBadge label={approval.decision === "approve" ? labels.approved : labels.denied} />
      ) : (
        <div className="agent-actions">
          <Button
            disabled={pending || Boolean(disabledReason) || !onDecision}
            onClick={() => onDecision?.(approval.id, "approve")}
          >
            {labels.approve}
          </Button>
          <Button
            variant="outline"
            disabled={pending || Boolean(disabledReason) || !onDecision}
            onClick={() => onDecision?.(approval.id, "deny")}
          >
            {labels.deny}
          </Button>
        </div>
      )}
      {pending ? (
        <p className="agent-context" role="status">
          {labels.pending}
        </p>
      ) : null}
      {disabledReason ? <p className="agent-context">{disabledReason}</p> : null}
    </section>
  );
}
