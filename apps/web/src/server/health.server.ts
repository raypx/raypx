import {
  healthResponse as liveness,
  readinessResponse as readiness,
  apiNotFoundResponse as notFound,
} from "@raypx/api/health";
import { withHttpRequest } from "@raypx/api/http";
import { runtime } from "./runtime.server";

// Route adapters catch domain errors before the framework renders its fallback.
export const healthResponse = ({ request }: { request: Request }) =>
  withHttpRequest(request, () => liveness());
export const readinessResponse = ({ request }: { request: Request }) =>
  withHttpRequest(request, () => readiness(runtime));
export const apiNotFoundResponse = ({ request }: { request: Request }) =>
  withHttpRequest(request, () => notFound());
