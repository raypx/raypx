import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";
import { panelStore } from "./runtime";

export default function setupRenderer(context: DockClientScriptContext) {
  let mounted: HTMLElement | undefined;
  const mount = (panel: HTMLElement) => {
    if (mounted === panel) return;
    mounted = panel;
    const host = document.createElement("div");
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.overflow = "auto";
    const target = document.createElement("div");
    const waiting = document.createElement("p");
    waiting.dataset.raypxDevtoolsWaiting = "true";
    waiting.textContent = "Waiting for page state / 等待页面状态";
    target.append(waiting);
    host.attachShadow({ mode: "open" }).append(target);
    panel.replaceChildren(host);
    panelStore.mount(target);
  };
  context.current.events.on("dom:panel:mounted", mount);
  context.current.events.on("entry:activated", () => panelStore.activate());
  context.current.events.on("entry:deactivated", () => panelStore.deactivate());
  // Loading the renderer is asynchronous; the panel may already have mounted.
  if (context.current.domElements.panel) mount(context.current.domElements.panel);
}
