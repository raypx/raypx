"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "../utils.js";

const Toaster = ({ theme = "system", className, toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className={cn("toaster group", className)}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster, type ToasterProps };
export { toast } from "sonner";
