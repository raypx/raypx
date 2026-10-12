import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@voidmix/ui/components/ui/button";
import type { ConversationMessage } from "../model/cloud";
import { MarkdownContent } from "../runs/markdown-content";

export function ConversationFeed({
  messages,
  labels,
}: {
  messages: readonly ConversationMessage[];
  labels: { title: string; user: string; assistant: string; latest: string; empty: string };
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const last = messages.at(-1);
  const previous = useRef<
    { first?: string; last?: string; text?: string; count: number; height: number } | undefined
  >(undefined);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const before = previous.current;
    const prepended =
      before &&
      messages.length > before.count &&
      messages[0]?.id !== before.first &&
      last?.id === before.last &&
      last?.text === before.text;
    if (prepended) node.scrollTop += node.scrollHeight - before.height;
    else if (follow.current) node.scrollTop = node.scrollHeight;
    previous.current = {
      ...(messages[0] ? { first: messages[0].id } : {}),
      ...(last ? { last: last.id, text: last.text } : {}),
      count: messages.length,
      height: node.scrollHeight,
    };
  }, [messages, last?.id, last?.text]);
  return (
    <section className="agent-timeline-shell" aria-label={labels.title}>
      <div
        ref={scroll}
        className="agent-timeline"
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
        {messages.length ? (
          messages.map((message) => (
            <article
              className={`agent-message${message.role === "user" ? " agent-message-user" : ""}`}
              key={message.id}
            >
              <strong>{labels[message.role]}</strong>
              <MarkdownContent text={message.text} streaming={message.streaming ?? false} />
            </article>
          ))
        ) : (
          <p className="agent-context">{labels.empty}</p>
        )}
      </div>
      {following ? null : (
        <Button
          variant="outline"
          className="agent-latest"
          onClick={() => {
            follow.current = true;
            setFollowing(true);
            if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
          }}
        >
          {labels.latest}
        </Button>
      )}
    </section>
  );
}
