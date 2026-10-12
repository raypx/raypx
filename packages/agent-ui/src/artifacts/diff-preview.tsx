import { lazy, Suspense, useEffect, useState } from "react";

const RichDiff = import.meta.env.SSR
  ? null
  : lazy(() => import("@pierre/diffs/react").then((module) => ({ default: module.MultiFileDiff })));

export function DiffPreview({
  name,
  before,
  after,
  theme = "light",
  label,
}: {
  name: string;
  before: string;
  after: string;
  theme?: "light" | "dark";
  label: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fallback = (
    <div className="agent-diff-fallback">
      <pre>{before}</pre>
      <pre>{after}</pre>
    </div>
  );
  return (
    <section className="agent-diff" aria-label={label}>
      {mounted && RichDiff ? (
        <Suspense fallback={fallback}>
          <RichDiff
            oldFile={{ name, contents: before }}
            newFile={{ name, contents: after }}
            options={{
              theme: theme === "dark" ? "github-dark" : "github-light",
              diffStyle: "unified",
            }}
          />
        </Suspense>
      ) : (
        fallback
      )}
    </section>
  );
}
