type EmailPreviewProps = {
  html: string;
  loading: boolean;
  viewMode: "desktop" | "mobile";
  width: number;
  height: number;
};

export function EmailPreview({ html, loading, viewMode, width, height }: EmailPreviewProps) {
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

  const getContainerStyle = () => {
    const baseWidth = viewMode === "mobile" ? width : Math.min(width, 1400);

    return {
      width: viewMode === "mobile" ? `${baseWidth}px` : "100%",
      maxWidth: viewMode === "mobile" ? `${baseWidth}px` : "1400px",
      minHeight: `${height}px`,
    };
  };

  return (
    <div
      className="h-full bg-card rounded-xl shadow-lg overflow-hidden border border-border"
      style={getContainerStyle()}
    >
      {html ? (
        <iframe className="w-full h-full border-none" srcDoc={html} title="Email Preview" />
      ) : (
        <div className="p-4 text-center text-muted-foreground">Select a template to preview</div>
      )}
    </div>
  );
}
