import { createApiClient } from "@raypx/client/api";
import { apiUrl } from "../auth/client.ts";
export const administrationClient = createApiClient({ baseUrl: apiUrl }).admin;
