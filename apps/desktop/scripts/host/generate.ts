import { fileURLToPath as entryFile } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { apiExposure } from "@raypx/contracts/api";
import { localParams } from "@raypx/contracts/local";
import { messages } from "@raypx/i18n/messages";
import { DESKTOP_METHODS } from "../../bridge.ts";

export async function generateNativeContracts(desktop: string) {
  const directory = resolve(desktop, "generated");
  const artifacts: Record<string, unknown> = {
    "desktop-methods.json": DESKTOP_METHODS,
    "local-methods.json": Object.keys(localParams).sort(),
    "notifications.json": {
      en: messages.en.tasks.notification,
      zh: messages.zh.tasks.notification,
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

  const paths = (exposure: "renderer" | "native") =>
    Object.entries(apiExposure)
      .flatMap(([group, methods]) =>
        Object.entries(methods)
          .filter(([, value]) => value === exposure)
          .map(([method]) => `/rpc/${group}/${method}`),
      )
      .sort();
  const source =
    JSON.stringify({ renderer: paths("renderer"), native: paths("native") }, null, 2) + "\n";
  const path = resolve(directory, "rpc-paths.json");
  await mkdir(directory, { recursive: true });
  await writeFile(path, source);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === entryFile(import.meta.url))
  await generateNativeContracts(resolve(import.meta.dirname, "../.."));
