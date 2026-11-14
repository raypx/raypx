import { rm } from "node:fs/promises";
import { resolve } from "node:path";
export async function generateNativeAssets(desktop: string) {
  for (const file of ["local-methods.json", "desktop-methods.json", "notifications.json"])
    await rm(resolve(desktop, "generated", file), { force: true });
}
if (import.meta.main) await generateNativeAssets(resolve(import.meta.dirname, "../.."));
