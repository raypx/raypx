"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "../hooks/use-theme";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      theme={resolvedTheme as ToasterProps["theme"]}
      {...props}
    />
  );
};

export { Toaster };
