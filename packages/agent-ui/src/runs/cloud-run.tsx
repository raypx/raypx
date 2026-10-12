import { useEffect, useRef, useState } from "react";
import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";
import type {
  CloudStatus,
  CloudTimelineItem,
  CloudToolView,
  ToolDetail,
  AgentUiCapabilities,
} from "../model/cloud";
import { isCloudRunTerminal } from "../model/cloud";
import { displayToolValue } from "../model";

export interface CloudRunLabels {
  status: Record<CloudStatus, string>;
  cancel: string;
  pending: string;
  retry: string;
  loading: string;
  failed: string;
  input: string;
  output: string;
  execution: string;
}
function CloudToolCard({
  tool,
  capability,
  labels,
}: {
  tool: CloudToolView;
  capability?: AgentUiCapabilities["loadToolDetail"];
  labels: CloudRunLabels;
}) {
  const [detail, setDetail] = useState<ToolDetail>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cached = useRef<{ status: CloudToolView["status"]; detail: ToolDetail } | null>(null);
  // A running tool's partial detail is refreshed on completion only while expanded.
  useEffect(() => {
    if (!expanded || !capability) {
      setPending(false);
      return;
    }
    if (cached.current?.status === tool.status) return;
    let current = true;
    setPending(true);
    setFailed(false);
    void capability(tool.id)
      .then((value) => {
        if (current) {
          cached.current = { status: tool.status, detail: value };
          setDetail(value);
        }
      })
      .catch(() => {
        if (current) setFailed(true);
      })
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [expanded, capability, tool.id, tool.status, attempt]);

  return (
    <details className="agent-tool" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span>
          <code>{tool.name}</code>
          {tool.summary ? <span className="agent-context"> · {tool.summary}</span> : null}
        </span>
        <StatusBadge
          label={labels.status[tool.status]}
          tone={tool.status === "failed" ? "danger" : "neutral"}
        />
      </summary>
      <div className="agent-tool-content">
        {pending ? (
          <p role="status">{labels.loading}</p>
        ) : failed ? (
          <>
            <p role="alert">{labels.failed}</p>
            <Button
              variant="outline"
              onClick={() => {
                cached.current = null;
                setAttempt((value) => value + 1);
              }}
            >
              {labels.retry}
            </Button>
          </>
        ) : (
          <>
            <h4>{labels.input}</h4>
            <pre>{displayToolValue(detail?.input ?? tool.input)}</pre>
            <h4>{labels.output}</h4>
            <pre>{displayToolValue(detail?.output ?? tool.output)}</pre>
          </>
        )}
      </div>
    </details>
  );
}
export function CloudRunTimeline({
  items,
  capabilities,
  labels,
}: {
  items: readonly CloudTimelineItem[];
  capabilities?: AgentUiCapabilities;
  labels: CloudRunLabels;
}) {
  return (
    <div className="agent-execution-timeline">
      {items.map((item) =>
        item.kind === "tool" ? (
          <CloudToolCard
            key={item.id}
            tool={item.tool}
            {...(capabilities?.loadToolDetail ? { capability: capabilities.loadToolDetail } : {})}
            labels={labels}
          />
        ) : item.kind === "execution" ? (
          <p className="agent-context" key={item.id}>
            {labels.execution}: {item.role} · {labels.status[item.status]}
          </p>
        ) : (
          <StatusBadge
            key={item.id}
            label={labels.status[item.status]}
            tone={item.status === "failed" ? "danger" : "neutral"}
          />
        ),
      )}
    </div>
  );
}
export function CloudRunControls({
  status,
  cancelPending = false,
  pending = false,
  error,
  onCancel,
  onRetry,
  labels,
}: {
  status: CloudStatus;
  cancelPending?: boolean;
  pending?: boolean;
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  labels: CloudRunLabels;
}) {
  return (
    <div className="agent-actions" aria-busy={pending || cancelPending}>
      <StatusBadge
        label={labels.status[status]}
        tone={status === "failed" ? "danger" : status === "succeeded" ? "success" : "neutral"}
      />
      {!isCloudRunTerminal(status) && onCancel ? (
        <Button variant="outline" disabled={pending || cancelPending} onClick={onCancel}>
          {cancelPending ? labels.pending : labels.cancel}
        </Button>
      ) : null}
      {["failed", "cancelled"].includes(status) && onRetry ? (
        <Button variant="outline" disabled={pending} onClick={onRetry}>
          {pending ? labels.pending : labels.retry}
        </Button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
