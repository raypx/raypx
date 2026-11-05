import { readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";

const { scripts } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };
export default defineConfig({
  run: {
    tasks: Object.fromEntries(
      Object.keys(scripts).map((name) => [
        `task:${name}`,
        { command: `tsx scripts/task.ts ${JSON.stringify(name)}`, cache: false },
      ]),
    ),
  },
});
