/** Leave IME text and OS shortcuts with xterm/browser; Herdr encodes VT keys. */
export function terminalKey(
  event: Pick<
    KeyboardEvent,
    "key" | "type" | "isComposing" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
) {
  if (event.type !== "keydown" || event.isComposing || event.metaKey) return null;
  const names: Record<string, string> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
    Enter: "enter",
    Tab: "tab",
    Backspace: "backspace",
    Delete: "delete",
    Insert: "insert",
    Escape: "esc",
    " ": "space",
  };
  const key =
    names[event.key] ??
    (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key) ||
    ((event.ctrlKey || event.altKey) && /^[a-z0-9]$/i.test(event.key))
      ? event.key.toLowerCase()
      : null);
  if (!key) return null;
  return [event.ctrlKey && "ctrl", event.altKey && "alt", event.shiftKey && "shift", key]
    .filter(Boolean)
    .join("+");
}
