import { createApiClient } from "@raypx/client/api";
import { apiUrl } from "../auth/client.js";

export const agentsClient = createApiClient({ baseUrl: apiUrl });
