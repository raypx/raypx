import { Monitor, Moon, Sun } from "lucide-react";
import { use } from "react";
import { cn } from "../lib/utils";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import type { UserTheme } from "./config";
import { ThemeContext } from "./provider";

const previewClasses: Record<UserTheme, string> = {
  light: "bg-white before:border-[#e5e5e5] before:bg-[#f5f5f5] [&>span]:bg-[#e5e5e5]",
  dark: "bg-[#171717] before:border-[#404040] before:bg-[#262626] [&>span]:bg-[#404040]",
  system:
    "bg-[linear-gradient(90deg,#fff_50%,#171717_50%)] before:border-[#e5e5e5] before:bg-[#f5f5f5] [&>span]:bg-[#a3a3a3]",
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
      className="flex w-auto gap-3 [@media(width<=420px)]:gap-[9px]"
    >
      {(
        [
          ["light", Sun],
          ["dark", Moon],
          ["system", Monitor],
        ] as const
      ).map(([theme, Icon]) => (
        <label
          className="relative w-[100px] cursor-pointer has-[:focus-visible]:rounded-[8px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-4 [@media(width<=420px)]:w-[76px]"
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
              "relative flex h-[72px] flex-col gap-1.5 overflow-hidden rounded-[8px] border border-border py-3 pr-3 pl-[25px] before:absolute before:inset-y-0 before:left-0 before:w-[15px] before:border-r before:content-[''] [&>span]:h-[5px] [&>span]:w-full [&>span]:rounded-[2px] [&>span:first-child]:w-3/5 [&>span:first-child]:bg-[#a3a3a3]",
              previewClasses[theme],
              current === theme && "outline-2 outline-foreground outline-offset-2",
            )}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
          <span className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] [@media(width<=420px)]:text-[11px]">
            <Icon size={16} />
            {labels[theme]}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
