import type { SourceView } from "../model/cloud";
import { safeSourceUrl } from "../model/cloud";

export function Citation({ source, number }: { source: SourceView; number: number }) {
  const href = safeSourceUrl(source.url);
  return href ? (
    <a
      className="agent-citation"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${number}. ${source.title}`}
    >
      [{number}]
    </a>
  ) : (
    <span>[{number}]</span>
  );
}
export function SourceList({
  sources,
  labels,
}: {
  sources: readonly SourceView[];
  labels: { title: string; empty: string };
}) {
  return (
    <section className="agent-sources" aria-label={labels.title}>
      <h3>{labels.title}</h3>
      {sources.length ? (
        <ol>
          {sources.map((source, index) => {
            const href = safeSourceUrl(source.url);
            return (
              <li key={source.id}>
                <div>
                  <span aria-hidden="true">{index + 1}. </span>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    <span>{source.title}</span>
                  )}
                </div>
                <p>{source.excerpt}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="agent-context">{labels.empty}</p>
      )}
    </section>
  );
}
