// import { Image } from "@raypx/ui/components/image";
import { useTheme } from "@raypx/ui/hooks/use-theme";
import { cn } from "@raypx/ui/lib/utils";
import { useEffect, useState } from "react";

const logoLight = "/logo.png";
const logoDark = "/logo-dark.png";

export function Logo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // During server-side rendering and initial client render, always use logoLight
  // This prevents hydration mismatch
  const logo = mounted && resolvedTheme === "dark" ? logoDark : logoLight;

  // Only show theme-dependent UI after hydration to prevent mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    // <Image
    //   alt="Logo"
    //   className={cn("size-8 object-cover", className)}
    //   height={96}
    //   layout="fixed"
    //   priority
    //   shape="rounded"
    //   src={logo}
    //   title="Logo"
    //   width={96}
    // />
    <img alt="Logo" className={cn("size-8 object-cover", className)} src={logo} />
  );
}
