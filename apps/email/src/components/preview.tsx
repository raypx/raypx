type EmailPreviewProps = {
  html: string;
  loading: boolean;
  viewMode: "desktop" | "mobile";
  width: number;
  height: number;
  from: string;
  to: string;
  subject: string;
};

export function EmailPreview({
  html,
  loading,
  viewMode: _viewMode,
  width: _width,
  height: _height,
  from: _from,
  to: _to,
  subject: _subject,
}: EmailPreviewProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-3xl mb-2 animate-pulse">⏳</div>
          <div>Rendering email...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-card rounded-xl overflow-hidden border border-border flex flex-col min-h-0">
      <div className="flex-1 min-h-0 bg-muted/40 overflow-auto">
        {html ? (
          <iframe
            className="w-full h-full border-none bg-white min-h-full"
            sandbox="allow-same-origin allow-scripts"
            srcDoc={html}
            title="Email Preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="p-4 text-center text-muted-foreground">
              Select a template to preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
