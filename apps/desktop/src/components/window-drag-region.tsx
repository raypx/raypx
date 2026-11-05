/** Keeps the window movable when the page has no toolbar. */
export function WindowDragRegion() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 right-[var(--raypx-titlebar-inset-right,0px)] left-[var(--raypx-titlebar-inset-left,0px)] h-[var(--raypx-titlebar-height,0px)] [--app-region:drag]"
    />
  );
}
