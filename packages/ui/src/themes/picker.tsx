import { MonitorIcon } from "@raypx/icons/monitor";
import { MoonIcon } from "@raypx/icons/moon";
import { SunIcon } from "@raypx/icons/sun";
import { use } from "react";
import { cn } from "../lib/utils.js";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.js";
import type { UserTheme } from "./config.js";
import { ThemeContext } from "./provider.js";

const previewClasses: Record<UserTheme, string> = {
  light:
    "bg-preview-light-bg before:border-preview-light-line before:bg-preview-light-sidebar [&>span]:bg-preview-light-line",
  dark: "bg-preview-dark-bg before:border-preview-dark-line before:bg-preview-dark-sidebar [&>span]:bg-preview-dark-line",
  system:
    "bg-[linear-gradient(90deg,var(--preview-light-bg)_50%,var(--preview-dark-bg)_50%)] before:border-preview-light-line before:bg-preview-light-sidebar [&>span]:bg-preview-title",
};

export interface ThemePickerProps {
  label: string;
  labels: Record<UserTheme, string>;
  /** Controlled value; defaults to the surrounding ThemeProvider. */
  value?: UserTheme;
  onValueChange?: (value: UserTheme) => void;
}

export function ThemePicker({ label, labels, value, onValueChange }: ThemePickerProps) {
  const context = use(ThemeContext);
  const current = value ?? context?.theme ?? "system";
  const change = onValueChange ?? context?.setTheme;
  return (
    <RadioGroup
      aria-label={label}
      value={current}
      onValueChange={(theme) => change?.(theme as UserTheme)}
      className="grid w-full max-w-76 grid-cols-3 gap-2"
    >
      {(
        [
          ["light", SunIcon],
          ["dark", MoonIcon],
          ["system", MonitorIcon],
        ] as const
      ).map(([theme, Icon]) => (
        <label
          className="relative min-w-0 cursor-pointer has-[:focus-visible]:rounded-md has-[:focus-visible]:focus-control has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
          key={theme}
        >
          <RadioGroupItem
            className="absolute size-px opacity-0"
            value={theme}
            aria-label={labels[theme]}
            data-theme-option={theme}
          />
          <span
            className={cn(
              "relative flex h-16 flex-col gap-1.5 overflow-hidden rounded-md border border-border py-2.5 pr-2.5 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-3.5 before:border-r before:content-[''] [&>span]:h-1 [&>span]:w-full [&>span]:rounded-xs [&>span:first-child]:w-3/5 [&>span:first-child]:bg-preview-title",
              previewClasses[theme],
              current === theme && "outline-2 outline-selected-line outline-offset-2",
            )}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
          <span className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-center text-xs">
            <Icon size={16} />
            {labels[theme]}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
