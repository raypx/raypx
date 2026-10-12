import { useRef, type KeyboardEvent } from "react";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";

import { IconButton } from "@voidmix/ui/icon-button";
import { cn } from "@voidmix/ui/lib/utils";
import { useTheme, type UserTheme } from "@voidmix/ui/theme";

import { useTranslations } from "../i18n/client";
import { themeOptions } from "./theme-options";

const themeIcons: Record<UserTheme, typeof Sun> = {
  dark: Moon,
  light: Sun,
  system: Desktop,
};

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme();
  const t = useTranslations("common");
  const optionRefs = useRef<Array<HTMLElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = event.key;
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? themeOptions.length - 1
          : (index + (key === "ArrowRight" || key === "ArrowDown" ? 1 : -1) + themeOptions.length) %
            themeOptions.length;
    const nextOption = themeOptions[nextIndex]!;
    setTheme(nextOption.value);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      aria-label={t("theme")}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5"
      role="radiogroup"
    >
      {themeOptions.map((option, index) => {
        const Icon = themeIcons[option.value];
        const selected = option.value === theme;
        const label = t(option.labelKey);

        return (
          <IconButton
            aria-checked={selected}
            label={label}
            className={cn(
              "text-muted-foreground",
              selected && "bg-background text-foreground shadow-xs hover:bg-background",
            )}
            key={option.value}
            onClick={() => setTheme(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            role="radio"
            size="icon-sm"
            tabIndex={selected ? 0 : -1}
            hint={`${t("theme")}: ${label}`}
            variant="ghost"
          >
            <Icon aria-hidden="true" />
          </IconButton>
        );
      })}
    </div>
  );
}
