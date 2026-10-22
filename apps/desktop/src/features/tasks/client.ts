import { createApiClient, createTaskClient } from "@raypx/client";
import { apiUrl } from "../auth/client";

/** Remote task client: oRPC reads plus relay commands and the account binding. */
export const taskClient = createTaskClient(createApiClient({ baseUrl: apiUrl }), {
  baseUrl: apiUrl,
});
