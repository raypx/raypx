import { recordDiagnostic, type RecordDiagnostic } from "../diagnostics.ts";
import { InstanceRuntime } from "../runtime/instances/index.ts";
import { instanceKeys } from "../runtime/instances/keys.ts";
import { ProfileStorage } from "../runtime/sqlite/index.ts";
import { profilePath } from "../runtime/state/index.ts";
import { InstanceError, instanceOrigin } from "@raypx/instances";
export async function loginInstance(options: {
  dataDir?: string;
  profile?: string;
  recordDiagnostic?: RecordDiagnostic;
}) {
  const origin = instanceOrigin(process.env.RAYPX_API_URL ?? "https://raypx.com");
  const webOrigin = instanceOrigin(process.env.RAYPX_WEB_URL ?? origin);
  const storage = new ProfileStorage(profilePath(options));
  try {
    const instance = new InstanceRuntime(profilePath(options), {
      keys: instanceKeys(storage.database),
      onProgress: (status, id) =>
        recordDiagnostic(options.recordDiagnostic, {
          operation: "instance.enrollment",
          status,
          id,
        }),
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
  } finally {
    storage.close();
  }
}
