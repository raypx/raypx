import { createApiClient, createTaskClient } from "@raypx/client";
import { apiUrl } from "../auth/client";

// Kept apart from the auth client so sign-in pages never load relay schemas.
export const taskClient = createTaskClient(createApiClient({ baseUrl: apiUrl }), {
  baseUrl: apiUrl,
});
