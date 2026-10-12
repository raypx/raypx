import { lazy, Suspense, useEffect, useState, type ComponentPropsWithoutRef } from "react";

import { safeSourceUrl } from "../model/cloud";

const contentComponents = {
  img: ({ alt }: ComponentPropsWithoutRef<"img">) => <span>{alt}</span>,
  a: ({ href, children }: ComponentPropsWithoutRef<"a">) => {
    const safe = href ? safeSourceUrl(href) : undefined;
    return safe ? (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
};
const RichMarkdown = import.meta.env.SSR
  ? null
  : lazy(() => import("streamdown").then((module) => ({ default: module.Streamdown })));

/** Browser-only enhancement keeps hydration and recovery readable without the vendor chunk. */
export function MarkdownContent({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = <div className="agent-plain-text">{text}</div>;
  return (
    <div className="agent-markdown">
      {mounted && RichMarkdown ? (
        <Suspense fallback={fallback}>
          <RichMarkdown
            skipHtml
            controls={false}
            components={contentComponents}
            urlTransform={(url) => safeSourceUrl(url) ?? ""}
            mode={streaming ? "streaming" : "static"}
            isAnimating={streaming}
          >
            {text}
          </RichMarkdown>
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
