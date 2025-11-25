import { ThemeSwitcher } from "@raypx/ui/business/theme-switcher";
import { Button } from "@raypx/ui/components/button";
import { ButtonGroup } from "@raypx/ui/components/button-group";
import { Code, Computer, Laptop, Smartphone } from "lucide-react";
import { SizeControl } from "./view-mode";

type ToolbarProps = {
  templateName: string;
  viewMode: "desktop" | "mobile";
  width: number;
  height: number;
  displayMode: "preview" | "tsx";
  onViewModeChange: (mode: "desktop" | "mobile") => void;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onDisplayModeChange: (mode: "preview" | "tsx") => void;
  onSendTestClick: () => void;
};

export function Toolbar({
  templateName,
  viewMode,
  width,
  height,
  displayMode,
  onViewModeChange,
  onWidthChange,
  onHeightChange,
  onDisplayModeChange,
  onSendTestClick,
}: ToolbarProps) {
  return (
    <div className="px-5 py-3 border-b border-border flex items-center gap-4 bg-card shadow-sm relative">
      <h2 className="text-base font-semibold text-card-foreground">{templateName}</h2>

      {/* Center section - Display Mode Toggle */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <ButtonGroup>
            <Button
              onClick={() => onDisplayModeChange("preview")}
              size="sm"
              variant={displayMode === "preview" ? "default" : "secondary"}
            >
              <Computer className="size-4" />
            </Button>
            <Button
              onClick={() => onDisplayModeChange("tsx")}
              size="sm"
              variant={displayMode === "tsx" ? "default" : "secondary"}
            >
              <Code className="size-4" />
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {/* Right section - View Mode Toggle, Size Control, Send Button and Theme Switcher */}
      <div className="flex items-center gap-4 justify-end">
        {/* View Mode Toggle (Desktop/Mobile) + Size Control - Only show in preview mode */}
        <div
          className={`flex gap-1 p-1 bg-muted rounded-lg shrink-0 ${displayMode !== "preview" ? "invisible pointer-events-none w-[200px]" : "w-auto"}`}
        >
          <ButtonGroup>
            <Button
              onClick={() => onViewModeChange("desktop")}
              size="sm"
              variant={viewMode === "desktop" ? "default" : "secondary"}
            >
              <Laptop className="size-4" />
            </Button>
            <Button
              onClick={() => onViewModeChange("mobile")}
              size="sm"
              variant={viewMode === "mobile" ? "default" : "secondary"}
            >
              <Smartphone className="size-4" />
            </Button>
            <SizeControl
              disabled={displayMode !== "preview"}
              height={height}
              onHeightChange={onHeightChange}
              onWidthChange={onWidthChange}
              width={width}
            />
          </ButtonGroup>
        </div>

        {/* Theme Switcher - Fixed width to prevent layout shift */}
        <div className="shrink-0 w-8 h-8 flex items-center justify-center">
          <ThemeSwitcher />
        </div>

        {/* Send Email Button - Fixed width to prevent layout shift */}
        <Button
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium min-w-[80px]"
          onClick={onSendTestClick}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
