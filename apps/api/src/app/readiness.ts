type Status = "ok" | "unavailable";
type Probe = () => Promise<unknown>;

const timeoutMs = 3_000;
const cooldownMs = 1_000;

function createProbeReader(probe: Probe, reuseMs: number) {
  let pending: Promise<Status> | undefined;
  let latest: { status: Status; expiresAt: number } | undefined;

  return function readProbe() {
    if (pending) return pending;
    if (latest && performance.now() < latest.expiresAt) return Promise.resolve(latest.status);

    pending = new Promise<Status>((resolve) => {
      function publish(status: Status) {
        latest = { status, expiresAt: performance.now() + reuseMs };
        resolve(status);
      }

      let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
        timer = undefined;
        // Release callers but keep the operation in flight until the driver settles.
        publish("unavailable");
      }, timeoutMs);

      function complete(status: Status) {
        if (timer !== undefined) {
          clearTimeout(timer);
          publish(status);
        }
        pending = undefined;
      }

      void Promise.resolve()
        .then(probe)
        .then(
          () => complete("ok"),
          () => complete("unavailable"),
        );
    });
    return pending;
  };
}

export function createReadinessCheck(probes: Record<string, Probe> = {}) {
  const readers = Object.entries(probes).map(([name, probe]) => ({
    name,
    read: createProbeReader(probe, name === "relay" ? 0 : cooldownMs),
  }));

  return async function readReadiness() {
    return Object.fromEntries(
      await Promise.all(readers.map(async ({ name, read }) => [name, await read()] as const)),
    );
  };
}

export type ReadReadiness = ReturnType<typeof createReadinessCheck>;
