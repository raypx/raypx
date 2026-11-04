/** Keeps the window movable when the page has no toolbar. */
export function WindowDragRegion() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 right-[var(--mygo-titlebar-inset-right,0px)] left-[var(--mygo-titlebar-inset-left,0px)] h-[var(--mygo-titlebar-height,0px)] [--app-region:drag]"
    />
  );
}
