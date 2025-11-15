type PreviewAreaProps = {
  html: string;
  loading: boolean;
  viewMode: "desktop" | "mobile";
};

export function PreviewArea({ html, loading, viewMode }: PreviewAreaProps) {
  return (
    <div className="flex-1 bg-muted/30 flex items-center justify-center p-5 overflow-auto">
      {loading ? (
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <div>Rendering email...</div>
        </div>
      ) : (
        <div
          className={`
            h-full bg-card rounded-xl shadow-lg overflow-hidden border border-border
            ${viewMode === "mobile" ? "w-[375px]" : "w-full max-w-[1400px]"}
          `}
        >
          {html ? (
            <iframe className="w-full h-full border-none" srcDoc={html} title="Email Preview" />
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              Select a template to preview
            </div>
          )}
        </div>
      )}
    </div>
  );
}
