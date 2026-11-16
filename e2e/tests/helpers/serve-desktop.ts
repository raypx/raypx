import { desktop } from "./surfaces.js";
import { resolve } from "node:path";
import { startBrowserPreview } from "./browser-server.js";

const server = await startBrowserPreview({
  directory: resolve(import.meta.dirname, "../../../apps/desktop/artifacts/browser/client"),
  port: Number(new URL(desktop).port),
});
const stop = () => {
  void server.stop(true);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
