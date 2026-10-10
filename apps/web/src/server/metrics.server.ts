import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError, withHttpRequest } from "@raypx/api/http";
import { services } from "./runtime.server";

function authorized(request: Request): boolean {
  const token = services.env.METRICS_TOKEN;
  if (!token) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const supplied = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, supplied);
}

/** Serves opt-in Prometheus data only to callers presenting the configured token. */
export const metricsResponse = ({ request }: { request: Request }) =>
  withHttpRequest(
    request,
    () => {
      if (!services.env.METRICS_ENABLED) throw new HttpError("NOT_FOUND");
      if (!authorized(request)) throw new HttpError("UNAUTHORIZED");
      return services.metrics.response();
    },
    { route: "/api/metrics" },
  );
