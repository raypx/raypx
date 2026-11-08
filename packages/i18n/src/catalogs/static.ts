import type { CatalogSources } from "../catalog-store.ts";
import { messages } from "../messages/index.ts";

/** Every catalog is bundled, so switching languages never waits. */
export const catalogs: CatalogSources = messages;
