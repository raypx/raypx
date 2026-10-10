import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

/** Schema generation only; runtime migration uses the explicit database CLI. */
export default defineConfig({
  dialect: "sqlite",
  schema: fileURLToPath(new URL("./src/schema.ts", import.meta.url)),
  out: fileURLToPath(new URL("./migrations/", import.meta.url)),
});
