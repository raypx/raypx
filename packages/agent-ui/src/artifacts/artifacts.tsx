import { Button } from "@voidmix/ui/components/ui/button";
import { EmptyState } from "@voidmix/ui/empty-state";
import { MarkdownContent } from "../runs/markdown-content";
export interface FileView {
  id: string;
  name: string;
}
export interface ArtifactListProps<T extends FileView = FileView> {
  artifacts: readonly T[];
  selectedId?: string;
  onSelect(artifact: T): void;
  labels: { title: string; empty: string };
}
export function ArtifactList<T extends FileView>({
  artifacts,
  selectedId,
  onSelect,
  labels,
}: ArtifactListProps<T>) {
  return (
    <section aria-label={labels.title} className="agent-artifacts">
      <h3>{labels.title}</h3>
      {!artifacts.length ? (
        <p className="agent-context">{labels.empty}</p>
      ) : (
        <ul>
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <Button
                variant={artifact.id === selectedId ? "secondary" : "ghost"}
                aria-pressed={artifact.id === selectedId}
                onClick={() => onSelect(artifact)}
              >
                {artifact.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export type ArtifactContent =
  | { kind: "text" | "markdown"; text: string }
  | { kind: "image"; src: string }
  | { kind: "pdf"; src: string }
  | { kind: "file" };
export interface ArtifactPreviewProps {
  name: string;
  content?: ArtifactContent;
  pending?: boolean;
  error?: string;
  onDownload?: () => void;
  labels: { loading: string; unavailable: string; download: string };
}
export function ArtifactPreview({
  name,
  content,
  pending = false,
  error,
  onDownload,
  labels,
}: ArtifactPreviewProps) {
  return (
    <section className="agent-preview" aria-label={name} aria-busy={pending}>
      <header>
        <h3>{name}</h3>
        {onDownload ? (
          <Button variant="outline" onClick={onDownload}>
            {labels.download}
          </Button>
        ) : null}
      </header>
      {pending ? (
        <p role="status">{labels.loading}</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : content?.kind === "markdown" ? (
        <MarkdownContent text={content.text} />
      ) : content?.kind === "text" ? (
        <pre className="agent-plain-text">{content.text}</pre>
      ) : content?.kind === "image" ? (
        <img src={content.src} alt={name} />
      ) : content?.kind === "pdf" ? (
        <iframe
          title={name}
          src={content.src}
          sandbox="allow-scripts"
          className="h-[32rem] w-full rounded-lg border border-border"
        />
      ) : (
        <EmptyState title={labels.unavailable} description="" />
      )}
    </section>
  );
}
