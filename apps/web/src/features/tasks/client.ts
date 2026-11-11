import { createApiClient } from "@raypx/client/api";
import { createTaskClient } from "@raypx/client/tasks";
import { apiUrl } from "../auth/client.js";

// Kept apart from the auth client so sign-in pages never load relay schemas.
export const taskClient = createTaskClient(createApiClient({ baseUrl: apiUrl }), {
  baseUrl: apiUrl,
});
