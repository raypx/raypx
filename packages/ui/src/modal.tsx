import { X } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { SheetContent } from "./components/ui/sheet";

/** Application-facing dialog naming and busy-state dismissal policy. */
export function Modal({
  title,
  description,
  closeLabel,
  trigger,
  children,
  open,
  onOpenChange,
  drawer = false,
  busy = false,
}: {
  title: string;
  description?: string;
  closeLabel: string;
  trigger: ReactElement;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawer?: boolean;
  busy?: boolean;
}) {
  const content = (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <DialogClose
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            className="absolute top-3 right-3"
            aria-label={closeLabel}
            disabled={busy}
          >
            <X aria-hidden="true" />
          </Button>
        }
      />
      {children}
    </>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy || next) onOpenChange(next);
      }}
    >
      <DialogTrigger render={trigger} />
      {drawer ? (
        <SheetContent side="left" showCloseButton={false} className="max-w-72 overflow-y-auto p-5">
          {content}
        </SheetContent>
      ) : (
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100svh-2rem)] overflow-y-auto"
        >
          {content}
        </DialogContent>
      )}
    </Dialog>
  );
}
