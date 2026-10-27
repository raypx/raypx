import type { CatalogSources } from "../catalog-store.js";
import { messages } from "../messages/index.js";

/** Every catalog is bundled, so switching languages never waits. */
export const catalogs: CatalogSources = messages;
