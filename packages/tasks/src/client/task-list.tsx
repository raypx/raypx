import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { AgentTask, SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";

export function TaskList({
  tasks,
  devices,
  selected,
  onSelect,
}: {
  tasks: AgentTask[];
  devices: SyncDevice[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  "use no memo"; // TanStack Virtual exposes a mutable instance that must be read each render.
  const t = useTranslations("tasks");
  const helpId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusRequest = useRef<string | null>(null);
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
  useEffect(() => {
    const id = focusRequest.current;
    const button = id ? buttons.current.get(id) : undefined;
    if (button) {
      button.focus({ preventScroll: true });
      focusRequest.current = null;
    }
  }, [focused]);
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
      className="overflow-auto overscroll-contain"
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
              <button
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
                className="flex w-full flex-col gap-2 border-b border-border p-4 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:bg-muted"
              >
                <span className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">
                  {task.prompt}
                </span>
                <span className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{task.provider === "claude" ? "Claude Code" : "Codex"}</span>
                  <span>{devices.find((device) => device.id === task.deviceId)?.name}</span>
                  <span>{t(task.status)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
