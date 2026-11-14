import type { ReactNode } from "react";
import { InputGroup, InputGroupAddon } from "@raypx/ui/components/ui/input-group";
import { cn } from "@raypx/ui/lib/utils";

/** Shared anatomy; each surface retains its own draft, input events and submission. */
export function ComposerCard({
  children,
  toolbar,
  attachments,
  className,
}: {
  children: ReactNode;
  toolbar: ReactNode;
  attachments?: ReactNode;
  className?: string;
}) {
  return (
    <InputGroup
      data-composer-card
      className={cn(
        "overflow-hidden rounded-3xl border-border/70 bg-background shadow-sm",
        className,
      )}
    >
      {attachments}
      {children}
      <InputGroupAddon align="block-end" className="flex-wrap gap-1 px-3 pt-1 pb-3">
        {toolbar}
      </InputGroupAddon>
    </InputGroup>
  );
}
