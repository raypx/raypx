"use client";

import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

type SizeControlProps = {
  width: number;
  height: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  disabled?: boolean;
};

export function SizeControl({
  width,
  height,
  onWidthChange,
  onHeightChange,
  disabled,
}: SizeControlProps) {
  const [localWidth, setLocalWidth] = useState(width.toString());
  const [localHeight, setLocalHeight] = useState(height.toString());
  const [open, setOpen] = useState(false);

  const handleWidthChange = (value: string) => {
    setLocalWidth(value);
    const numValue = parseInt(value, 10);
    if (!Number.isNaN(numValue) && numValue > 0) {
      onWidthChange(numValue);
    }
  };

  const handleHeightChange = (value: string) => {
    setLocalHeight(value);
    const numValue = parseInt(value, 10);
    if (!Number.isNaN(numValue) && numValue > 0) {
      onHeightChange(numValue);
    }
  };

  const handleWidthIncrement = () => {
    const newWidth = width + 1;
    setLocalWidth(newWidth.toString());
    onWidthChange(newWidth);
  };

  const handleWidthDecrement = () => {
    if (width > 1) {
      const newWidth = width - 1;
      setLocalWidth(newWidth.toString());
      onWidthChange(newWidth);
    }
  };

  const handleHeightIncrement = () => {
    const newHeight = height + 1;
    setLocalHeight(newHeight.toString());
    onHeightChange(newHeight);
  };

  const handleHeightDecrement = () => {
    if (height > 1) {
      const newHeight = height - 1;
      setLocalHeight(newHeight.toString());
      onHeightChange(newHeight);
    }
  };

  // Sync local state when props change
  useEffect(() => {
    setLocalWidth(width.toString());
  }, [width]);

  useEffect(() => {
    setLocalHeight(height.toString());
  }, [height]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="px-3 py-1.5" disabled={disabled} size="sm" variant="secondary">
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-4">
        <div className="space-y-4">
          {/* Width Control */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="width-input">
              Width
            </Label>
            <div className="flex items-center gap-1">
              <Input
                className="flex-1 h-8 text-sm"
                id="width-input"
                min={1}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (!value || parseInt(value, 10) <= 0) {
                    setLocalWidth(width.toString());
                  }
                }}
                onChange={(e) => handleWidthChange(e.target.value)}
                type="number"
                value={localWidth}
              />
              <div className="flex flex-col border-l border-border pl-1">
                <Button
                  className="h-3.5 w-5 p-0 hover:bg-accent"
                  onClick={handleWidthIncrement}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ChevronUp className="size-2.5" />
                </Button>
                <Button
                  className="h-3.5 w-5 p-0 hover:bg-accent"
                  onClick={handleWidthDecrement}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDown className="size-2.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Height Control */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="height-input">
              Height
            </Label>
            <div className="flex items-center gap-1">
              <Input
                className="flex-1 h-8 text-sm"
                id="height-input"
                min={1}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (!value || parseInt(value, 10) <= 0) {
                    setLocalHeight(height.toString());
                  }
                }}
                onChange={(e) => handleHeightChange(e.target.value)}
                type="number"
                value={localHeight}
              />
              <div className="flex flex-col border-l border-border pl-1">
                <Button
                  className="h-3.5 w-5 p-0 hover:bg-accent"
                  onClick={handleHeightIncrement}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ChevronUp className="size-2.5" />
                </Button>
                <Button
                  className="h-3.5 w-5 p-0 hover:bg-accent"
                  onClick={handleHeightDecrement}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDown className="size-2.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
