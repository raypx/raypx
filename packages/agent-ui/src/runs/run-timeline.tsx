import { useEffect, useRef, useState } from "react";
import { Button } from "@voidmix/ui/components/ui/button";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { EmptyState } from "@voidmix/ui/empty-state";
import { ToolCallCard, type ToolCallCardProps } from "../tools";
import { ApprovalCard, type ApprovalCardProps } from "../approvals";
import type { TimelineItem, RunStatus } from "../model";
import { MarkdownContent } from "./markdown-content";

export interface RunTimelineProps {
  items: readonly TimelineItem[];
  prompt?: string;
  streaming?: boolean;
  pendingApprovalIds?: readonly string[];
  onDecision?: ApprovalCardProps["onDecision"];
  labels: {
    title: string;
    empty: string;
    emptyDescription: string;
    user: string;
    assistant: string;
    latest: string;
    artifact: string;
    status: Record<RunStatus, string>;
    tool: ToolCallCardProps["labels"];
    approval: ApprovalCardProps["labels"];
  };
}
export function RunTimeline({
  items,
  prompt,
  streaming = false,
  pendingApprovalIds = [],
  onDecision,
  labels,
}: RunTimelineProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const last = items.at(-1);
  const revision = last?.kind === "message" ? last.text : last?.id;
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [items.length, revision]);
  return (
    <section className="agent-timeline-shell" aria-label={labels.title}>
      <div
        className="agent-timeline"
        ref={scroll}
        tabIndex={0}
        role="log"
        aria-live="off"
        onScroll={() => {
          const node = scroll.current;
          if (!node) return;
          const next = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
          follow.current = next;
          setFollowing(next);
        }}
      >
        {prompt ? (
          <article className="agent-message agent-message-user">
            <strong>{labels.user}</strong>
            <p>{prompt}</p>
          </article>
        ) : null}
        {!items.length ? (
          <EmptyState title={labels.empty} description={labels.emptyDescription} />
        ) : null}
        {items.map((item) => {
          switch (item.kind) {
            case "message":
              return (
                <article key={item.id} className="agent-message">
                  <strong>{item.roleId === "user" ? labels.user : labels.assistant}</strong>
                  <MarkdownContent text={item.text} streaming={streaming && item === last} />
                </article>
              );
            case "tool":
              return <ToolCallCard key={item.id} tool={item.tool} labels={labels.tool} />;
            case "approval":
              return (
                <ApprovalCard
                  key={item.id}
                  approval={item.approval}
                  pending={pendingApprovalIds.includes(item.approval.id)}
                  {...(onDecision ? { onDecision } : {})}
                  labels={labels.approval}
                />
              );
            case "status":
              return (
                <div key={item.id} className="agent-status">
                  <StatusBadge
                    label={labels.status[item.status]}
                    tone={item.status === "failed" ? "danger" : "neutral"}
                  />
                  {item.error ? <p role="alert">{item.error}</p> : null}
                </div>
              );
            case "artifact":
              return (
                <p className="agent-context" key={item.id}>
                  {labels.artifact}: {item.name}
                </p>
              );
          }
        })}
      </div>
      {!following ? (
        <Button
          className="agent-latest"
          variant="outline"
          onClick={() => {
            follow.current = true;
            setFollowing(true);
            if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
          }}
        >
          {labels.latest}
        </Button>
      ) : null}
    </section>
  );
}
