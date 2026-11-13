import { createApiClient } from "@raypx/client/api";
import { apiUrl, desktopFetch } from "./client.js";

export const accountClient = createApiClient({ baseUrl: apiUrl, fetch: desktopFetch });
