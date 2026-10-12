import { StatusBadge } from "@voidmix/ui/status-badge";
import { displayToolValue, type ToolView } from "../model";

export interface ToolCallCardProps {
  tool: ToolView;
  labels: { running: string; succeeded: string; failed: string; input: string; output: string };
}
export function ToolCallCard({ tool, labels }: ToolCallCardProps) {
  return (
    <details className="agent-tool">
      <summary>
        <code>{tool.name}</code>
        <StatusBadge
          label={labels[tool.status]}
          tone={tool.status === "failed" ? "danger" : "neutral"}
        />
      </summary>
      <div className="agent-tool-content">
        <h4>{labels.input}</h4>
        <pre>{displayToolValue(tool.input)}</pre>
        {tool.output !== undefined ? (
          <>
            <h4>{labels.output}</h4>
            <pre>{displayToolValue(tool.output)}</pre>
          </>
        ) : null}
      </div>
    </details>
  );
}
