import { Button } from "@raypx/ui/components/button";

type ToolbarProps = {
  templateName: string;
  viewMode: "desktop" | "mobile";
  onViewModeChange: (mode: "desktop" | "mobile") => void;
  onSendTestClick: () => void;
};

export function Toolbar({
  templateName,
  viewMode,
  onViewModeChange,
  onSendTestClick,
}: ToolbarProps) {
  return (
    <div className="px-5 py-3 border-b border-border flex items-center gap-4 bg-card shadow-sm">
      <h2 className="text-base font-semibold flex-1 text-card-foreground">{templateName}</h2>

      {/* View Mode Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        <Button
          className={`
            px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
            ${viewMode === "desktop" ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}
          `}
          onClick={() => onViewModeChange("desktop")}
          variant="ghost"
        >
          🖥️ Desktop
        </Button>
        <Button
          className={`
            px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
            ${viewMode === "mobile" ? "bg-background text-foreground shadow-sm hover:bg-background hover:text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}
          `}
          onClick={() => onViewModeChange("mobile")}
          variant="ghost"
        >
          📱 Mobile
        </Button>
      </div>

      {/* Send Test Email Button */}
      <Button className="px-4 py-2 rounded-lg text-sm font-medium" onClick={onSendTestClick}>
        📧 Send Test
      </Button>
    </div>
  );
}
