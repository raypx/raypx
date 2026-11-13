import { createApiClient } from "@raypx/client/api";
import { apiUrl, desktopFetch } from "../auth/client.js";

export const agentsClient = createApiClient({
  baseUrl: apiUrl,
  fetch: (input, init) => desktopFetch(input, init),
});
