import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";

interface Confirmation {
  requestKey?: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
}

type PendingConfirmation = Confirmation & {
  promise: Promise<boolean>;
  resolve: (accepted: boolean) => void;
  returnFocus: HTMLElement | null;
};
/** Queue distinct requests; an explicit identity shares one pending answer. */
export function useConfirmation() {
  const [request, setRequest] = useState<
    (Confirmation & { returnFocus: HTMLElement | null }) | null
  >(null);
  const [open, setOpen] = useState(false);
  const pending = useRef<PendingConfirmation | null>(null);
  const queue = useRef<PendingConfirmation[]>([]);
  const mounted = useRef(true);
  const cancel = useRef<HTMLButtonElement>(null);
  const next = useCallback(() => {
    if (!mounted.current || pending.current) return;
    const item = queue.current.shift();
    if (!item) return;
    pending.current = item;
    setRequest(item);
    setOpen(true);
  }, []);
  const settle = useCallback(
    (accepted: boolean) => {
      const resolve = pending.current;
      pending.current = null;
      setOpen(false);
      resolve?.resolve(accepted);
      queueMicrotask(next);
    },
    [next],
  );
  useEffect(() => {
    mounted.current = true;
    const waiting = queue.current;
    return () => {
      mounted.current = false;
      pending.current?.resolve(false);
      pending.current = null;
      for (const item of waiting.splice(0)) item.resolve(false);
    };
  }, []);
  const confirm = useCallback(
    (options: Confirmation): Promise<boolean> => {
      if (!mounted.current) return Promise.resolve(false);
      const existing = options.requestKey
        ? [pending.current, ...queue.current].find(
            (item) => item?.requestKey === options.requestKey,
          )
        : undefined;
      if (existing) return existing.promise;
      let answer!: (accepted: boolean) => void;
      const promise = new Promise<boolean>((resolve) => {
        answer = resolve;
      });
      queue.current.push({
        ...options,
        promise,
        resolve: answer,
        returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
      next();
      return promise;
    },
    [next],
  );
  return {
    confirm,
    dialog: request && (
      <Dialog
        open={open}
        onOpenChange={(visible) => {
          if (!visible) settle(false);
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          initialFocus={cancel}
          finalFocus={() => (request.returnFocus?.isConnected ? request.returnFocus : false)}
        >
          <DialogHeader>
            <DialogTitle className="wrap-anywhere">{request.title}</DialogTitle>
            <DialogDescription className="wrap-anywhere">{request.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={cancel} variant="outline" onClick={() => settle(false)}>
              {request.cancelLabel}
            </Button>
            <Button variant="destructive" onClick={() => settle(true)}>
              {request.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  };
}
