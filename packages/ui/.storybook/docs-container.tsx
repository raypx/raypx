import { DocsContainer } from "@storybook/addon-docs/blocks";
import { themes } from "storybook/theming";
import { useSyncExternalStore, type ComponentProps } from "react";

function subscribeTheme(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Keeps the Docs shell and transparent component canvases on the preview palette. */
export function ThemedDocsContainer(props: ComponentProps<typeof DocsContainer>) {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return (
    <main>
      <DocsContainer {...props} theme={dark ? themes.dark : themes.light} />
    </main>
  );
}
