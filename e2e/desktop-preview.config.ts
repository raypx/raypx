import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../apps/desktop");

// The browser gate consumes packaged SPA assets without Start's SSR preview hook.
export default {
  root,
  appType: "spa",
  build: { outDir: resolve(root, "dist/client") },
};
