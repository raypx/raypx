import type { KeyboardEvent } from "react";

/** Let the form's validation and submission guards own every send path. */
export function submitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (
    event.key !== "Enter" ||
    !(event.ctrlKey || event.metaKey) ||
    event.nativeEvent.isComposing ||
    event.keyCode === 229
  )
    return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
