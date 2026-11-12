import { preloadCatalog } from "./i18n.js";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// Lazy catalogs: hydrate once the server-rendered language is ready, so the first
// client render matches the HTML. A failed chunk falls back to suspending in the provider.
void preloadCatalog(document.documentElement.lang)
  .catch(() => {})
  .then(() => {
    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <StartClient />
        </StrictMode>,
      );
    });
  });
