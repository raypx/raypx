import { createConsola } from "consola";

/** Consumer host output stays visible in CI and tests without wrapping global console. */
export const scriptLogger = createConsola({ fancy: false, level: 3 }).withTag("consumer");
