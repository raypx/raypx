import { useTheme } from "@raypx/ui/hooks/use-theme";
import { cn } from "@raypx/ui/lib/utils";
import { useEffect, useState } from "react";

export function Logo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const logoLight = "/logo.png";
  const logoDark = "/logo-dark.png";

  // During server-side rendering and initial client render, always use logoLight
  // This prevents hydration mismatch
  const logo = mounted && resolvedTheme === "dark" ? logoDark : logoLight;

  // Only show theme-dependent UI after hydration to prevent mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <img
      alt="Logo"
      className={cn("size-8 rounded-md", className)}
      height={96}
      src={logo}
      title="Logo"
      width={96}
    />
  );
}
