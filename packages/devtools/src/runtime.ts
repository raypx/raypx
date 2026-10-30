/** One ESM instance per page; never synchronize page state through DevTools RPC. */
let panel: HTMLElement | null = null;
let active = false;
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
export const panelStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => (active ? panel : null),
  getServerSnapshot: () => null,
  mount(target: HTMLElement) {
    panel = target;
    active = true;
    notify();
  },
  activate() {
    active = true;
    notify();
  },
  deactivate() {
    active = false;
    notify();
  },
  clear() {
    panel = null;
    active = false;
    notify();
  },
};
if (import.meta.hot) import.meta.hot.dispose(() => panelStore.clear());

const clientSelector = 'script[data-raypx-devtools-client], script[src$="/__devtools/embedded.js"]';
export function ensureEmbeddedClient() {
  if (window.top !== window || document.querySelector(clientSelector)) return;
  const script = document.createElement("script");
  script.type = "module";
  script.dataset.raypxDevtoolsClient = "true";
  script.src = new URL("/__devtools/embedded.js", window.location.origin).href;
  // A failed load may be retried after HMR without duplicating a successful client.
  script.addEventListener("error", () => script.remove(), { once: true });
  document.body.append(script);
}
