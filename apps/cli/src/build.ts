import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (Bun.version !== "1.4.3") throw new Error("CLI artifacts must be compiled with Bun 1.4.3");
await mkdir(resolve(root, "dist"), { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve(root, "src/main.ts")],
  compile: { outfile: resolve(root, "dist", process.platform === "win32" ? "raypx.exe" : "raypx") },
  target: "bun",
  minify: true,
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
