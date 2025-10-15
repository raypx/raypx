import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { Skeleton } from "@raypx/ui/components/skeleton";
import { cn } from "@raypx/ui/lib/utils";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useTheme } from "../hooks/use-theme";

type ThemeConfig = {
  key: string;
  icon: React.ReactNode;
  label: string;
};

const themeConfig: ThemeConfig[] = [
  {
    key: "light",
    icon: <Sun className="size-4" />,
    label: "Light",
  },
  {
    key: "dark",
    icon: <Moon className="size-4" />,
    label: "Dark",
  },
  {
    key: "system",
    icon: <Laptop className="size-4" />,
    label: "System",
  },
];

/**
 * Dropdown theme switcher component
 * Shows all available themes (light, dark, system) in a dropdown menu
 */
export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme, themeMode } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton during SSR/hydration to prevent layout shift
  if (!mounted) {
    return <Skeleton className="size-8 rounded-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Toggle theme"
          className="size-8 cursor-pointer rounded-full border border-border p-0.5"
          size="sm"
          variant="ghost"
        >
          {resolvedTheme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themeConfig.map((theme) => (
          <DropdownMenuItem
            className={cn(
              "flex cursor-pointer items-center justify-between",
              themeMode === theme.key && "bg-accent",
            )}
            key={theme.key}
            onClick={() => setTheme(theme.key)}
          >
            <div className="flex items-center gap-3">
              {theme.icon}
              <span className="text-sm">{theme.label}</span>
            </div>
            {themeMode === theme.key && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Horizontal theme switcher component
 * Shows all themes in a horizontal layout (useful for footers/sidebars)
 */
export const ThemeSwitcherHorizontal = memo(() => {
  const { themeMode, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-full border ms-auto p-1">
      {themeConfig.map((theme) => (
        <Button
          aria-label={`Switch to ${theme.label} theme`}
          className={cn(
            "size-6 px-0 rounded-full cursor-pointer transition-colors",
            mounted && themeMode === theme.key && "bg-muted text-foreground",
          )}
          key={theme.key}
          onClick={() => setTheme(theme.key)}
          size="icon"
          variant="ghost"
        >
          {theme.icon}
        </Button>
      ))}
    </div>
  );
});
