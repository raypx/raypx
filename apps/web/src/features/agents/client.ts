import { createApiClient } from "@raypx/client/api";
import { apiFetch } from "../auth/client.js";

export const agentsClient = createApiClient({ fetch: apiFetch });
