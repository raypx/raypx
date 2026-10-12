import { createCloudWorkerRuntime } from "./runtime.js";
if (process.argv.includes("--check-documents")) {
  const { checkDocuments } = await import("./runtime-checks.js");
  await checkDocuments();
} else if (process.argv.includes("--check")) {
  const { checkRuntime } = await import("./runtime-checks.js");
  await checkRuntime(new URL("./runner.mjs", import.meta.url));
} else {
  const signal = new AbortController();
  const stop = () => signal.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const runtime = await createCloudWorkerRuntime();
  try {
    await runtime.run(signal.signal);
  } finally {
    await runtime.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
