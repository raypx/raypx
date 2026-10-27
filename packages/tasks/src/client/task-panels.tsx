import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "@raypx/i18n/browser";

const widthKey = "raypx.task-list-width.v1";
const clamp = (value: number) => Math.max(30, Math.min(50, value));
function widthStore(key: string) {
  return {
    read: () => {
      try {
        const value = Number(localStorage.getItem(key));
        return value >= 30 && value <= 50 ? value : 38;
      } catch {
        return 38;
      }
    },
    subscribe: (listener: () => void) => {
      const changed = (event: StorageEvent) => {
        if (event.key === key || event.key === null) listener();
      };
      window.addEventListener("storage", changed);
      return () => window.removeEventListener("storage", changed);
    },
  };
}

/** A bounded split view on desktop, and a list/detail navigation on small windows. */
export function TaskPanels({
  list,
  detail,
  detailVisible,
  storageKey = widthKey,
}: {
  list: ReactNode;
  detail: ReactNode;
  detailVisible: boolean;
  storageKey?: string | undefined;
}) {
  const t = useTranslations("tasks");
  const root = useRef<HTMLDivElement>(null);
  const storage = useMemo(() => widthStore(storageKey), [storageKey]);
  const savedWidth = useSyncExternalStore(storage.subscribe, storage.read, () => 38);
  const [changedWidth, setWidth] = useState<number>();
  const width = changedWidth ?? savedWidth;
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () =>
      setHeight(Math.max(320, window.innerHeight - node.getBoundingClientRect().top - 24));
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (node.parentElement) observer?.observe(node.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  function persist(value: number) {
    try {
      localStorage.setItem(storageKey, String(value));
    } catch {
      /* Keep the current in-memory width. */
    }
  }
  return (
    <div
      ref={root}
      data-task-panels
      className="grid grid-cols-1 items-start @min-[58rem]:grid-cols-[minmax(20rem,var(--task-list-width))_0.75rem_minmax(0,1fr)]"
      style={
        {
          "--task-list-width": `${width}%`,
          "--task-pane-height": height ? `${height}px` : "65dvh",
        } as CSSProperties
      }
    >
      <div
        data-task-pane="list"
        className={`min-w-0 space-y-5 @min-[58rem]:flex @min-[58rem]:h-[var(--task-pane-height)] @min-[58rem]:min-h-0 @min-[58rem]:flex-col @min-[58rem]:gap-5 @min-[58rem]:space-y-0 @min-[58rem]:overflow-y-auto @min-[58rem]:overscroll-contain @min-[58rem]:pr-3 @min-[58rem]:[&>[data-task-composer]]:max-h-[60%] @min-[58rem]:[&>[data-task-composer]]:shrink-0 @min-[58rem]:[&>[data-task-composer]]:overflow-y-auto ${detailVisible ? "hidden @min-[58rem]:flex" : ""}`}
      >
        {list}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={t("resizeTaskPanels")}
        aria-orientation="vertical"
        aria-valuemin={30}
        aria-valuemax={50}
        aria-valuenow={Math.round(width)}
        className="group hidden h-full min-h-72 touch-none cursor-col-resize items-stretch justify-center outline-none @min-[58rem]:flex focus-visible:bg-accent"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const bounds = root.current!.getBoundingClientRect();
          if (bounds.width) setWidth(clamp(((event.clientX - bounds.left) / bounds.width) * 100));
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          persist(width);
        }}
        onKeyDown={(event) => {
          const value =
            event.key === "Home"
              ? 30
              : event.key === "End"
                ? 50
                : event.key === "ArrowLeft"
                  ? clamp(width - 2)
                  : event.key === "ArrowRight"
                    ? clamp(width + 2)
                    : undefined;
          if (value === undefined) return;
          event.preventDefault();
          setWidth(value);
          persist(value);
        }}
      >
        <span
          aria-hidden="true"
          className="w-px bg-border group-hover:bg-foreground/35 group-focus-visible:bg-foreground"
        />
      </div>
      <div
        data-task-pane="detail"
        className={`min-w-0 @min-[58rem]:max-h-[var(--task-pane-height)] @min-[58rem]:overflow-y-auto @min-[58rem]:overscroll-contain @min-[58rem]:pl-5 ${!detailVisible ? "hidden @min-[58rem]:block" : ""}`}
      >
        {detail}
      </div>
    </div>
  );
}
