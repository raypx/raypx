import { resolve } from "node:path";
import { startBrowserPreview } from "@raypx/tooling/browser-server";

const server = await startBrowserPreview({
  directory: resolve(import.meta.dirname, "../../../apps/desktop/artifacts/browser/client"),
  port: 4174,
});
const stop = () => {
  void server.stop(true);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
