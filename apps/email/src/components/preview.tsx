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
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="mb-2 animate-pulse text-3xl">⏳</div>
          <div>Rendering email...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-auto bg-muted/40">
        {html ? (
          <iframe
            className="h-full min-h-full w-full border-none bg-white"
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
