import { CodeView } from "./code-view";
import { EmailPreview } from "./email-preview";

type PreviewAreaProps = {
  html: string;
  source: string;
  loading: boolean;
  sourceLoading: boolean;
  viewMode: "desktop" | "mobile";
  width: number;
  height: number;
  displayMode: "preview" | "tsx";
};

export function PreviewArea({
  html,
  source,
  loading,
  sourceLoading,
  viewMode,
  width,
  height,
  displayMode,
}: PreviewAreaProps) {
  return (
    <div className="flex-1 bg-muted/30 flex items-center justify-center p-5 overflow-auto">
      {displayMode === "tsx" ? (
        <CodeView source={source} sourceLoading={sourceLoading} />
      ) : (
        <EmailPreview
          height={height}
          html={html}
          loading={loading}
          viewMode={viewMode}
          width={width}
        />
      )}
    </div>
  );
}
