import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import en from "@raypx/tasks/messages/en";
import zh from "@raypx/tasks/messages/zh";

export async function generateNativeAssets(desktop: string) {
  const directory = resolve(desktop, "generated");
  for (const file of ["local-methods.json", "desktop-methods.json"])
    await rm(resolve(directory, file), { force: true });
  const artifacts: Record<string, unknown> = {
    "notifications.json": {
      en: en.tasks.notification,
      zh: zh.tasks.notification,
    },
  };
  for (const [file, value] of Object.entries(artifacts)) {
    const path = resolve(directory, file);
    const source = JSON.stringify(value, null, 2) + "\n";
    if ((await readFile(path, "utf8").catch(() => "")) !== source) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source);
    }
  }
}
if (import.meta.main) await generateNativeAssets(resolve(import.meta.dirname, "../.."));
