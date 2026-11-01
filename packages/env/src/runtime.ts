import z from "zod";

import type { Preset } from "./types.js";

export const runtimeEnv = {
  id: "runtime",
  shared: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
} as const satisfies Preset;
