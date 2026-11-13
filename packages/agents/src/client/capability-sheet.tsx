import { useRef, type ComponentProps, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@raypx/ui/components/ui/sheet";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { IconButton } from "@raypx/ui/icon-button";
import { CloseIcon } from "@raypx/icons/close";
import { cn } from "@raypx/ui/lib/utils";

type ContentProps = ComponentProps<typeof SheetContent>;

/** One focus and dismissal boundary for Routines, Memory and the team computer. */
export function CapabilitySheet({
  open,
  onClose,
  title,
  closeLabel,
  finalFocus,
  id,
  className,
  bodyClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  finalFocus: ContentProps["finalFocus"];
  id?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <TooltipProvider escapeKeyBubbles>
        <SheetContent
          id={id}
          showCloseButton={false}
          initialFocus={heading}
          finalFocus={finalFocus}
          className={cn(
            "gap-0 overflow-hidden motion-reduce:transform-none motion-reduce:transition-none",
            className,
          )}
        >
          <SheetHeader className="flex-row items-center justify-between border-b">
            <SheetTitle
              ref={heading}
              tabIndex={-1}
              className="min-w-0 truncate rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </SheetTitle>
            <IconButton size="icon-sm" label={closeLabel} onClick={onClose}>
              <CloseIcon aria-hidden="true" />
            </IconButton>
          </SheetHeader>
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4",
              bodyClassName,
            )}
          >
            {children}
          </div>
        </SheetContent>
      </TooltipProvider>
    </Sheet>
  );
}
