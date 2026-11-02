import { getRelayEnvironment } from "./env.js";
import { createRelayRuntime } from "./runtime.js";

try {
  const runtime = await createRelayRuntime(getRelayEnvironment());
  const stop = () => {
    void runtime.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch {
  console.error("Relay startup failed");
  process.exit(1);
}
