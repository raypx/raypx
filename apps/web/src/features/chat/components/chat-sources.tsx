import { truncateTextMiddle } from "~/lib/dashboard-utils";
import type { ChatSource, GroupedSource } from "../types";

interface ChatSourcesProps {
  sources: ChatSource[];
}

export function ChatSources({ sources }: ChatSourcesProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  // Group sources by documentId or documentName
  const groupedSources = sources.reduce(
    (acc, source) => {
      const key = source.documentId || source.documentName;
      if (!acc[key]) {
        acc[key] = [];
      }
      const group = acc[key];
      if (group) {
        group.push(source);
      }
      return acc;
    },
    {} as Record<string, ChatSource[]>,
  );

  // Convert to array and sort by highest similarity
  const groupedArray: GroupedSource[] = Object.values(groupedSources)
    .map((sourcesGroup) => {
      const firstSource = sourcesGroup[0];
      if (!firstSource) return null;
      return {
        documentName: firstSource.documentName || "Unknown",
        documentId: firstSource.documentId || "",
        chunks: sourcesGroup
          .map((s) => ({
            chunkIndex: s.chunkIndex ?? 0,
            similarity: s.similarity,
          }))
          .sort((a, b) => b.similarity - a.similarity),
        maxSimilarity: Math.max(...sourcesGroup.map((s) => s.similarity)),
      };
    })
    .filter((g): g is GroupedSource => g !== null)
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    .slice(0, 5);

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <p className="text-xs text-muted-foreground mb-1">Sources ({sources.length}):</p>
      <div className="space-y-1">
        {groupedArray.map((group, idx) => {
          const firstChunk = group.chunks[0];
          if (!firstChunk) return null;
          return (
            <div
              className="text-xs text-muted-foreground"
              key={idx}
              title={`${group.documentName} - chunks: ${group.chunks.map((c) => c.chunkIndex + 1).join(", ")}`}
            >
              • {truncateTextMiddle(group.documentName, 40, 15, 15)}
              {group.chunks.length > 1 ? (
                <span className="ml-1">
                  (chunks {group.chunks.map((c) => c.chunkIndex + 1).join(", ")})
                </span>
              ) : (
                <span className="ml-1">(chunk {firstChunk.chunkIndex + 1})</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
