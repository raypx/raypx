import { preloadCatalog } from "./i18n.js";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

// Hydrate with the server-rendered language. Retry a transient chunk failure
// once before the provider handles a failed initial catalog.
const initialLocale = document.documentElement.lang;
void preloadCatalog(initialLocale)
  .catch(() => preloadCatalog(initialLocale))
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
