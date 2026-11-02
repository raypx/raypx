import { recordDiagnostic, type RecordDiagnostic } from "../diagnostics";
import { InstanceRuntime } from "../runtime/instances";
import { profilePath } from "../runtime/state";
import { InstanceError, instanceOrigin } from "@raypx/instances";
export async function loginInstance(options: {
  dataDir?: string;
  profile?: string;
  recordDiagnostic?: RecordDiagnostic;
}) {
  const origin = instanceOrigin(process.env.RAYPX_API_URL ?? "https://raypx.pro");
  const webOrigin = instanceOrigin(process.env.RAYPX_WEB_URL ?? origin);
  const instance = new InstanceRuntime(profilePath(options), {
    onProgress: (status, id) =>
      recordDiagnostic(options.recordDiagnostic, { operation: "instance.enrollment", status, id }),
  });
  const result = await instance.begin(origin);
  if (result.registered) {
    console.log("Instance is already registered.");
    return;
  }
  console.log(`Sign in at ${webOrigin}/account and approve instance code: ${result.code}`);
  const signal = AbortSignal.any([AbortSignal.timeout(600_000)]);
  const stop = new AbortController();
  const abort = () => stop.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    while (!signal.aborted && !stop.signal.aborted) {
      if ((await instance.poll()).status === "approved") {
        console.log("Instance registered. Local work is available offline.");
        return;
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 2000);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          stop.signal.removeEventListener("abort", done);
          resolve();
        }
        signal.addEventListener("abort", done, { once: true });
        stop.signal.addEventListener("abort", done, { once: true });
      });
    }
    throw new InstanceError("INSTANCE_ENROLLMENT_EXPIRED");
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}
