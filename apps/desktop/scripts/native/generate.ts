import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localParams } from "@raypx/contracts/local";
import { messages } from "@raypx/i18n/messages";
import { DESKTOP_METHODS } from "../../bridge";

const directory = resolve(import.meta.dirname, "../../generated");
await mkdir(directory, { recursive: true });
const artifacts = {
  "desktop-methods.json": DESKTOP_METHODS,
  "local-methods.json": Object.keys(localParams).sort(),
  "notifications.json": { en: messages.en.tasks.notification, zh: messages.zh.tasks.notification },
};
for (const [file, value] of Object.entries(artifacts)) {
  const path = resolve(directory, file);
  const source = JSON.stringify(value, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8")) !== source)
      throw new Error(`Regenerate ${file} with native:generate`);
  } else if ((await readFile(path, "utf8").catch(() => "")) !== source)
    await writeFile(path, source);
}
