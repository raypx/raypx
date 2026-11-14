import { useRef, type ComponentProps, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { IconButton } from "@raypx/ui/icon-button";
import { CloseIcon } from "@raypx/icons/close";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";

/** Space-wide administration uses the same bounded dialog anatomy as account settings. */
export function SpaceSettingsDialog({
  open,
  onClose,
  title,
  closeLabel,
  finalFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  finalFocus: ComponentProps<typeof DialogContent>["finalFocus"];
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <TooltipProvider escapeKeyBubbles>
        <DialogContent
          showCloseButton={false}
          initialFocus={heading}
          finalFocus={finalFocus}
          className="flex w-[calc(100%-2rem)] h-[min(48rem,calc(100dvh-2rem))] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <DialogHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
            <DialogTitle
              ref={heading}
              tabIndex={-1}
              className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </DialogTitle>
            <IconButton label={closeLabel} size="icon-sm" onClick={onClose}>
              <CloseIcon aria-hidden="true" />
            </IconButton>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {children}
          </div>
        </DialogContent>
      </TooltipProvider>
    </Dialog>
  );
}
