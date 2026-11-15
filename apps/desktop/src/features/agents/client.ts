import { createApiClient } from "@raypx/client/api";
import { apiUrl, desktopFetch } from "../auth/client.js";

import type { SetupChecklistPort } from "@raypx/account/model";

export const agentsClient = createApiClient({
  baseUrl: apiUrl,
  fetch: (input, init) => desktopFetch(input, init),
});

export const setupChecklistPort: SetupChecklistPort = {
  access: (options) => agentsClient.account.access({}, options),
  status: (options) => agentsClient.configuration.setupStatus({}, options),
};
