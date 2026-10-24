import { createApiClient, createTaskClient } from "@raypx/client";
import { apiUrl, desktopFetch } from "../auth/client";

/** Remote task client: oRPC reads plus relay commands and the account binding. */
export const taskClient = createTaskClient(
  createApiClient({ baseUrl: apiUrl, fetch: desktopFetch }),
  {
    baseUrl: apiUrl,
  },
);
