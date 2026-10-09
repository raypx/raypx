import { checkHealth } from "@raypx/api-client/health";
import { useEffect, useState } from "react";

export type HealthCheckStatus = "loading" | "connected" | "error";

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthCheckStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function connect() {
      try {
        await checkHealth({ signal: controller.signal });
        if (!controller.signal.aborted) setStatus("connected");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void connect();
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    if (status === "loading") return;
    setStatus("loading");
    setAttempt((value) => value + 1);
  }

  return { status, retry };
}
