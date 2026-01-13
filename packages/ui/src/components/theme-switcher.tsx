import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { type ThemeKey, themeConfig, themeIcons } from "@raypx/ui/lib/theme-config";
import { cn } from "@raypx/ui/lib/utils";
import { IconCheck } from "@tabler/icons-react";
import { memo, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/icon";
import { useTheme } from "../hooks/use-theme";

type ThemeConfig = {
  key: ThemeKey;
  icon: (typeof themeConfig)[number]["icon"];
  label: string;
};

const getThemeLabel = (key: ThemeKey): string => {
  return themeConfig.find((t) => t.value === key)?.label ?? key;
};

const THEME_MAP = {
  light: {
    key: "light" as const,
    icon: themeIcons.light,
    label: getThemeLabel("light"),
  },
  dark: {
    key: "dark" as const,
    icon: themeIcons.dark,
    label: getThemeLabel("dark"),
  },
  system: {
    key: "system" as const,
    icon: themeIcons.system,
    label: getThemeLabel("system"),
  },
} satisfies Record<ThemeKey, ThemeConfig>;

const THEME_ICON_MAP: Record<ThemeKey, ThemeConfig["icon"]> = {
  light: THEME_MAP.light.icon,
  dark: THEME_MAP.dark.icon,
  system: THEME_MAP.system.icon,
};

const getThemeIconComponent = (themeKey: ThemeKey): ThemeConfig["icon"] => {
  return THEME_ICON_MAP[themeKey] ?? THEME_MAP.light.icon;
};

const THEMES_BY_MODE = {
  "light-dark": [THEME_MAP.light, THEME_MAP.dark],
  "light-dark-system": [THEME_MAP.light, THEME_MAP.dark, THEME_MAP.system],
} satisfies Record<"light-dark" | "light-dark-system", ThemeConfig[]>;

// Union type that represents all possible variants
type ThemeSwitcherVariant = "toggle" | "horizontal" | "dropdown";

// Props for light-dark mode
type ThemeSwitcherPropsLightDark = {
  /** Only show light and dark modes */
  mode?: "light-dark";
  /** Display variant: toggle (default) or horizontal */
  variant?: "toggle" | "horizontal";
};

// Props for light-dark-system mode
type ThemeSwitcherPropsLightDarkSystem = {
  /** Show all three theme options (light, dark, system) */
  mode?: "light-dark-system";
  /** Display variant: dropdown (default) or horizontal */
  variant?: "dropdown" | "horizontal";
};

// Combined props type
type ThemeSwitcherProps = ThemeSwitcherPropsLightDark | ThemeSwitcherPropsLightDarkSystem;

/**
 * Theme switcher component
 * Shows available themes (light, dark, system) in different display styles:
 * - toggle: Single button that switches between light and dark (only for light-dark mode)
 * - horizontal: Button group with all available themes side by side
 * - dropdown: Dropdown menu with all available themes (default for light-dark-system mode)
 */
export const ThemeSwitcher = memo(({ mode = "light-dark-system", variant }: ThemeSwitcherProps) => {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme, themeMode } = useTheme();
  const BUTTON_CLASSES = "cursor-pointer rounded-full border border-border p-0.5";
  const ICON_SIZE = "size-4";

  const availableThemes = useMemo(() => {
    return THEMES_BY_MODE[mode];
  }, [mode]);

  // Determine effective variant: use provided variant or default based on mode
  const effectiveVariant: ThemeSwitcherVariant = useMemo(() => {
    if (variant) {
      // TypeScript should catch incompatible combinations, but add runtime check as safety
      if (variant === "toggle" && mode !== "light-dark") {
        return "dropdown";
      }
      if (variant === "dropdown" && mode !== "light-dark-system") {
        return "toggle";
      }
      return variant;
    }

    // Default variants based on mode
    return mode === "light-dark" ? "toggle" : "dropdown";
  }, [variant, mode]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton during SSR/hydration to prevent layout shift
  if (!mounted && (effectiveVariant === "dropdown" || effectiveVariant === "toggle")) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  // Toggle button: single button that switches between light and dark (only for light-dark mode)
  if (effectiveVariant === "toggle") {
    // Use resolvedTheme to get the actual theme (light or dark), not themeMode which could be "system"
    const currentResolvedTheme: "light" | "dark" = resolvedTheme === "light" ? "light" : "dark";
    const nextTheme: "light" | "dark" = currentResolvedTheme === "light" ? "dark" : "light";

    const icon = getThemeIconComponent(currentResolvedTheme);

    return (
      <Button
        aria-label={`Switch to ${nextTheme} theme`}
        className={cn("size-8", BUTTON_CLASSES)}
        onClick={() => setTheme(nextTheme)}
        size="sm"
        variant="ghost"
      >
        <Icon className={ICON_SIZE} icon={icon} />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  // Horizontal button group
  if (effectiveVariant === "horizontal") {
    return (
      <div className="ms-auto flex items-center gap-2 rounded-full border p-1">
        {availableThemes.map((theme) => {
          return (
            <Button
              aria-label={`Switch to ${theme.label} theme`}
              className={cn(
                "size-6 cursor-pointer rounded-full px-0 transition-colors",
                mounted && themeMode === theme.key && "bg-muted text-foreground",
              )}
              key={theme.key}
              onClick={() => setTheme(theme.key)}
              size="icon"
              variant="ghost"
            >
              <Icon className={ICON_SIZE} icon={theme.icon} />
            </Button>
          );
        })}
      </div>
    );
  }

  const triggerIcon = getThemeIconComponent(resolvedTheme === "light" ? "light" : "dark");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Toggle theme"
            className={cn("size-8", BUTTON_CLASSES, "focus-visible:!none")}
            size="sm"
            variant="ghost"
          >
            <Icon className={ICON_SIZE} icon={triggerIcon} />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {availableThemes.map((theme) => {
          return (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                themeMode === theme.key && "bg-accent",
              )}
              key={theme.key}
              onClick={() => setTheme(theme.key)}
            >
              <div className="flex items-center gap-3">
                <Icon className={ICON_SIZE} icon={theme.icon} />
                <span className="text-sm">{theme.label}</span>
              </div>
              {themeMode === theme.key && <IconCheck className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

ThemeSwitcher.displayName = "ThemeSwitcher";
