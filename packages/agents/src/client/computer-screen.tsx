import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/ui/dialog";
import { TooltipProvider } from "@raypx/ui/components/ui/tooltip";
import { cn } from "@raypx/ui/lib/utils";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Empty, EmptyTitle } from "@raypx/ui/components/ui/empty";
import { IconButton } from "@raypx/ui/icon-button";
import { HelpHint } from "@raypx/ui/help-hint";
import { useConfirmation } from "@raypx/ui/confirmation";
import { ArrowUpRightIcon } from "@raypx/icons/arrow-up-right";
import { MonitorIcon } from "@raypx/icons/monitor";
import { PlayIcon } from "@raypx/icons/play";
import { StopIcon } from "@raypx/icons/stop";
import { RefreshIcon } from "@raypx/icons/refresh";
import type { ComputerScreenController } from "../model/computer-screen.js";
import type { ComputerView } from "../model/computer.js";
import { useTranslations } from "./i18n.js";

const errorKeys = {
  SCREEN_CONTROL_HELD: "screen.controlHeld",
  SCREEN_CONTROL_REQUIRED: "screen.controlExpired",
  SCREEN_CONTROL_EXPIRED: "screen.controlExpired",
  SCREEN_INPUT_REFUSED: "screen.inputRefused",
  SCREEN_OWNER_REQUIRED: "screen.ownerRequired",
  SCREEN_STOPPED: "screen.stopped",
  SCREEN_NOT_RUNNING: "screen.stopped",
  SPACE_MEMBER_REMOVED: "screen.memberRemoved",
  SPACE_MEMBER_LEFT: "screen.memberLeft",
  SPACE_DELETING: "screen.spaceDeleting",
  SESSION_ENDED: "screen.sessionExpired",
  SESSION_EXPIRED: "screen.sessionExpired",
  ACCESS_DENIED: "screen.accessDenied",
  SCREEN_IDLE_TIMEOUT: "screen.idleTimeout",
  SCREEN_STREAM_EXPIRED: "screen.reconnecting",
} as const;
const keyNames: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backspace: "BackSpace",
  Delete: "Delete",
  Enter: "Return",
  Home: "Home",
  End: "End",
  PageUp: "Page_Up",
  PageDown: "Page_Down",
  " ": "space",
};

function ControlStatus({ controller }: { controller: ComputerScreenController }) {
  const t = useTranslations("agents");
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const control = view.state?.status === "available" ? view.state.control : null;
  if (!control) return <p className="text-xs text-muted-foreground">{t("screen.viewOnly")}</p>;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p role="status">
        {controller.controlling
          ? t("screen.youControl")
          : t("screen.controlledBy", { name: control.displayName })}
      </p>
      <ControlRemaining key={control.expiresAt} expiresAt={control.expiresAt} />
      <p className="text-muted-foreground">{t("screen.agentPaused")}</p>
    </div>
  );
}

function ControlRemaining({ expiresAt }: { expiresAt: string }) {
  const t = useTranslations("agents");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return (
    <p className="text-muted-foreground tabular-nums">
      {t("screen.remaining", { seconds: String(seconds) })}
    </p>
  );
}

export function computerScreenPoint(
  box: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
  clientX: number,
  clientY: number,
) {
  const scale = Math.min(box.width / width, box.height / height);
  if (scale <= 0) return null;
  const left = box.left + (box.width - width * scale) / 2;
  const top = box.top + (box.height - height * scale) / 2;
  return {
    x: Math.max(0, Math.min(width - 1, Math.floor((clientX - left) / scale))),
    y: Math.max(0, Math.min(height - 1, Math.floor((clientY - top) / scale))),
    inside:
      clientX >= left &&
      clientX < left + width * scale &&
      clientY >= top &&
      clientY < top + height * scale,
  };
}

export function ComputerScreen({
  controller,
  status,
}: {
  controller: ComputerScreenController;
  status: ComputerView["status"];
}) {
  const t = useTranslations("agents");
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const expand = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const releasing = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const take = useRef<HTMLButtonElement>(null);
  const pressed = useRef<{
    id: number;
    button: "left" | "middle" | "right";
    x: number;
    y: number;
    lastMove: number;
  } | null>(null);
  const confirmation = useConfirmation();
  useEffect(() => {
    if (status === "running") void controller.open();
    else controller.close();
    return () => controller.close();
  }, [controller, status]);
  const state = view.state;
  const available = state?.status === "available";
  const running = available && state.running;
  const control = available ? state.control : null;
  const controlling = controller.controlling;
  useEffect(() => {
    if (controlling) surface.current?.focus();
  }, [controlling]);
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (!controlling || event.nativeEvent.isComposing || event.target !== event.currentTarget)
      return;
    if (event.key === "Tab") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      void releaseControl();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      controller.input({ kind: "text", text: event.key });
      return;
    }
    let name = keyNames[event.key] ?? event.key;
    if (["Control", "Alt", "Meta", "Shift"].includes(name)) return;
    if (event.shiftKey) name = `shift+${name}`;
    if (event.altKey) name = `alt+${name}`;
    if (event.ctrlKey || event.metaKey) name = `ctrl+${name}`;
    if (/^[A-Za-z0-9_][A-Za-z0-9_+-]{0,39}$/.test(name))
      controller.input({ kind: "key", key: name, action: "press" });
  }
  async function releaseControl() {
    if (releasing.current) return;
    releasing.current = true;
    try {
      const pointer = pressed.current;
      pressed.current = null;
      await controller.flushInput();
      if (pointer)
        controller.input({
          kind: "pointer",
          x: pointer.x,
          y: pointer.y,
          button: pointer.button,
          action: "up",
        });
      await controller.flushInput();
      await controller.release();
      take.current?.focus();
    } finally {
      releasing.current = false;
    }
  }
  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    const pointer = pressed.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pressed.current = null;
    controller.input({
      kind: "pointer",
      x: pointer.x,
      y: pointer.y,
      button: pointer.button,
      action: "up",
    });
  }
  function sendPointer(event: PointerEvent<HTMLDivElement>, action: "down" | "up" | "move") {
    if (!controlling || !view.frame) return;
    event.preventDefault();
    surface.current?.focus();
    const image = event.currentTarget.querySelector("img");
    if (!image) return;
    const box = image.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const point = computerScreenPoint(
      box,
      view.frame.width,
      view.frame.height,
      event.clientX,
      event.clientY,
    );
    if (!point || (action === "down" && !point.inside)) return;
    const { x, y } = point;
    const buttons = { 0: "left", 1: "middle", 2: "right" } as const;
    const captured = pressed.current;
    if (action !== "down" && captured?.id !== event.pointerId) return;
    const button = captured?.button ?? buttons[event.button as keyof typeof buttons];
    if (!button) return;
    if (action === "move") {
      if (!captured || Date.now() - captured.lastMove < 250) return;
      pressed.current = { ...captured, x, y, lastMove: Date.now() };
    }
    if (action === "down") {
      if (captured) return;
      pressed.current = { id: event.pointerId, button, x, y, lastMove: 0 };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (action === "up") {
      pressed.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    controller.input({ kind: "pointer", x, y, button, action });
  }
  async function stop() {
    if (
      await confirmation.confirm({
        requestKey: "stop-screen",
        title: t("screen.stopTitle"),
        description: t("screen.stopDescription"),
        confirmLabel: t("screen.stop"),
        cancelLabel: t("cancel"),
      })
    )
      await controller.stop();
  }
  let message = t("loading");
  if (status !== "running" || state?.status === "not-running")
    message = t("screen.computerStopped");
  else if (state?.status === "not-configured" || state?.status === "unavailable")
    message = t("screen.unavailable");
  else if (available && !running) message = t("screen.stopped");
  else if (view.paused) message = t("screen.viewPaused");
  else if (running) message = t("screen.connecting");
  const content = (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      {view.error && (
        <Alert>
          <AlertDescription>
            {t(errorKeys[view.error as keyof typeof errorKeys] ?? "screen.error")}
          </AlertDescription>
        </Alert>
      )}
      {view.frame ? (
        <div
          ref={surface}
          role="textbox"
          aria-readonly={!controlling}
          aria-multiline="true"
          tabIndex={0}
          aria-label={t(controlling ? "screen.inputSurface" : "screen.viewSurface")}
          aria-describedby={`screen-help-${controller.spaceId}`}
          className="min-w-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={key}
          onPointerDown={(event) => sendPointer(event, "down")}
          onPointerUp={(event) => sendPointer(event, "up")}
          onPointerMove={(event) => sendPointer(event, "move")}
          onPointerCancel={cancelPointer}
          onLostPointerCapture={cancelPointer}
          onContextMenu={(event) => {
            if (controlling) event.preventDefault();
          }}
        >
          <img
            src={`data:${view.frame.mimeType};base64,${view.frame.bytes}`}
            width={view.frame.width}
            height={view.frame.height}
            alt={t("screen.image")}
            draggable={false}
            className={cn(
              "block h-auto max-h-[60vh] w-full object-contain motion-reduce:transition-none",
              expanded && "max-h-[calc(100dvh-22rem)]",
            )}
          />
        </div>
      ) : (
        <Empty className="min-h-28 border">
          <EmptyTitle className="text-sm">{message}</EmptyTitle>
        </Empty>
      )}
      {available && (
        <div className="flex flex-wrap items-center gap-2">
          {!running && (
            <Button size="sm" disabled={view.pending} onClick={() => void controller.start()}>
              <PlayIcon data-icon="inline-start" aria-hidden="true" />
              {t("screen.start")}
            </Button>
          )}
          {running && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={view.pending}
                onClick={() => void stop()}
              >
                <StopIcon data-icon="inline-start" aria-hidden="true" />
                {t("screen.stop")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={view.pending}
                onClick={() => void controller.togglePause()}
              >
                {t(view.paused ? "screen.resumeView" : "screen.pauseView")}
              </Button>
            </>
          )}
        </div>
      )}
      {running && (
        <>
          <ControlStatus controller={controller} />
          <div className="flex flex-wrap gap-2">
            {controlling ? (
              <Button size="sm" disabled={view.pending} onClick={() => void releaseControl()}>
                {t("screen.release")}
              </Button>
            ) : (
              <Button
                ref={take}
                size="sm"
                disabled={view.pending || !view.connected || !!control || view.paused}
                onClick={() => void controller.acquire()}
              >
                {t("screen.take")}
              </Button>
            )}
            {control && !controlling && available && state.canForceRelease && (
              <Button
                variant="outline"
                size="sm"
                disabled={view.pending}
                onClick={() => void controller.forceRelease()}
              >
                {t("screen.forceRelease")}
              </Button>
            )}
          </div>
          {controlling && (
            <ScreenTextInput
              key={control?.id}
              controller={controller}
              text={text}
              onTextChange={setText}
              onEscape={() => void releaseControl()}
            />
          )}
        </>
      )}
      <p id={`screen-help-${controller.spaceId}`} className="text-xs text-muted-foreground">
        {t(controlling ? "screen.escape" : "screen.focusHint")}
      </p>
    </div>
  );
  return (
    <Dialog
      open={expanded}
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key" && controlling) {
          details.cancel();
          void releaseControl();
          return;
        }
        setExpanded(open);
      }}
    >
      <TooltipProvider escapeKeyBubbles>
        <section
          aria-label={t("screen.title")}
          className="flex min-w-0 flex-col gap-3 border-t pt-4"
        >
          <header className="flex min-w-0 items-center gap-2">
            <MonitorIcon className="size-4 shrink-0" aria-hidden="true" />
            <h3 className="flex-1 text-sm font-medium">{t("screen.title")}</h3>
            <HelpHint label={t("screen.helpLabel")} description={t("screen.help")} />
            <DialogTrigger
              render={
                <IconButton ref={expand} label={t("screen.expand")} size="icon-sm">
                  <ArrowUpRightIcon aria-hidden="true" />
                </IconButton>
              }
            />
            <IconButton
              label={t("refresh")}
              size="icon-sm"
              disabled={status !== "running" || view.pending}
              onClick={() => void controller.refresh()}
            >
              <RefreshIcon aria-hidden="true" />
            </IconButton>
          </header>
          {!expanded && content}
        </section>
        <DialogContent
          closeLabel={t("close")}
          initialFocus={() => (controlling ? surface.current : heading.current)}
          finalFocus={expand}
          className="flex max-w-[calc(100vw-2rem)] flex-col sm:max-w-[min(80rem,calc(100vw-4rem))] motion-reduce:animate-none motion-reduce:transition-none"
          backdropProps={{ className: "motion-reduce:animate-none motion-reduce:transition-none" }}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape" && controlling && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              void releaseControl();
            }
          }}
        >
          <DialogHeader className="pr-8">
            <DialogTitle ref={heading} tabIndex={-1}>
              {t("screen.expandedTitle")}
            </DialogTitle>
          </DialogHeader>
          {expanded && content}
        </DialogContent>
        {confirmation.dialog}
      </TooltipProvider>
    </Dialog>
  );
}

function ScreenTextInput({
  controller,
  text,
  onTextChange,
  onEscape,
}: {
  controller: ComputerScreenController;
  text: string;
  onTextChange: (text: string) => void;
  onEscape: () => void;
}) {
  const t = useTranslations("agents");
  const inputId = `screen-text-${controller.viewerId}`;
  return (
    <form
      className="flex min-w-0 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text) {
          controller.input({ kind: "text", text });
          onTextChange("");
        }
      }}
    >
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        {t("screen.typeText")}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          id={inputId}
          autoComplete="off"
          value={text}
          maxLength={4096}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              onEscape();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" disabled={!text}>
          {t("screen.type")}
        </Button>
      </div>
    </form>
  );
}
