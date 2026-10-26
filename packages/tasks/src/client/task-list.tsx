import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { AgentTask, SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Bot } from "lucide-react";
import { Badge } from "@raypx/ui/components/ui/badge";

export function TaskList({
  tasks,
  devices,
  selected,
  onSelect,
  fill = false,
  restoreFocus = 0,
}: {
  tasks: AgentTask[];
  devices: SyncDevice[];
  selected: string | null;
  onSelect: (id: string) => void;
  fill?: boolean;
  restoreFocus?: number;
}) {
  "use no memo"; // TanStack Virtual exposes a mutable instance that must be read each render.
  const t = useTranslations("tasks");
  const helpId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLElement>());
  const focusRequest = useRef<string | null>(null);
  const restored = useRef(restoreFocus);
  const returning = useRef(false);
  const [focused, setFocused] = useState<string | null>(null);
  const activeIndex = Math.max(
    0,
    tasks.findIndex((task) => task.id === (focused ?? selected)),
  );
  const getItemKey = useCallback((index: number) => tasks[index]!.id, [tasks]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      // Keep the keyboard tab stop mounted, including while scrolling with a pointer.
      const indexes = new Set(defaultRangeExtractor(range));
      indexes.add(activeIndex);
      return [...indexes].sort((a, b) => a - b);
    },
    [activeIndex],
  );
  // oxlint-disable-next-line react/incompatible-library -- This component opts out of compiler memoization and consumes the mutable instance locally.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: tasks.length,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: () => 112,
    overscan: 4,
    rangeExtractor,
    useFlushSync: false,
  });
  useLayoutEffect(() => {
    if (restored.current === restoreFocus) return;
    restored.current = restoreFocus;
    if (!selected) return;
    focusRequest.current = selected;
    returning.current = true;
    setFocused(selected);
    const index = tasks.findIndex((task) => task.id === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [restoreFocus, selected, tasks, virtualizer]);
  // A previously hidden virtual viewport can render its selected row after ResizeObserver fires.
  useEffect(() => {
    const id = focusRequest.current;
    const button = id ? buttons.current.get(id) : undefined;
    if (button) {
      if (returning.current) button.scrollIntoView?.({ block: "nearest", behavior: "instant" });
      returning.current = false;
      button.focus({ preventScroll: true });
      focusRequest.current = null;
    }
  });
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(tasks.length - 1, index + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, index - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tasks.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusRequest.current = tasks[next]!.id;
    setFocused(tasks[next]!.id);
    virtualizer.scrollToIndex(next, { align: "auto" });
  }
  return (
    <div
      ref={viewport}
      data-task-list
      className={`relative overflow-auto overscroll-contain ${fill ? "min-h-48 flex-1" : ""}`}
      style={{ maxHeight: "min(60dvh, 40rem)" }}
    >
      <span id={helpId} className="sr-only">
        {t("taskNavigation")}
      </span>
      <ul
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Preserve list semantics in Safari when list-style is none.
        role="list"
        aria-label={t("title")}
        aria-describedby={helpId}
        className="relative m-0 list-none p-0"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const task = tasks[row.index]!;
          return (
            <li
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              aria-posinset={row.index + 1}
              aria-setsize={tasks.length}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              <Button
                variant="ghost"
                ref={(element) => {
                  if (element) buttons.current.set(task.id, element);
                  else buttons.current.delete(task.id);
                }}
                type="button"
                tabIndex={row.index === activeIndex ? 0 : -1}
                onFocus={() => setFocused(task.id)}
                onKeyDown={(event) => navigate(event, row.index)}
                onClick={() => onSelect(task.id)}
                aria-pressed={selected === task.id}
                className="h-auto w-full items-stretch gap-2 rounded-none border-b border-border p-4 text-left whitespace-normal hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted flex-col"
              >
                <span className="flex w-full min-w-0 items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
                  >
                    <Bot className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">
                    {task.prompt}
                  </span>
                </span>
                <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{task.provider === "claude" ? "Claude Code" : "Codex"}</span>
                  <span className="truncate">
                    {devices
                      .find((device) => device.id === task.deviceId)
                      ?.projects.find((project) => project.id === task.projectId)?.name ??
                      devices.find((device) => device.id === task.deviceId)?.name}
                  </span>
                  <Badge
                    variant={
                      ["failed", "interrupted", "delivery_failed"].includes(task.status)
                        ? "destructive"
                        : task.status === "waiting"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {t(task.status)}
                  </Badge>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
