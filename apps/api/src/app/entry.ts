import type { NitroServerEntry } from "nitro/types";

/** HTTP drains before Nitro closes the runner; Compose leaves another five seconds for handover. */
export default {
  gracefulShutdown: { gracefulTimeout: 25 },
} satisfies NitroServerEntry;
