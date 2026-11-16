import {
  createAuthClient,
  adminClient,
  passkeyClient,
  emailOTPClient,
  twoFactorClient,
} from "@raypx/auth/client";
import { accountAccessControl, accountRoles } from "@raypx/auth/access";

export { apiOrigin, webOrigin, apiFetch } from "../../origins.js";
import { apiFetch } from "../../origins.js";

export const authClient = createAuthClient({
  fetchOptions: { customFetchImpl: apiFetch },
  plugins: [
    adminClient({ ac: accountAccessControl, roles: accountRoles }),
    passkeyClient(),
    emailOTPClient(),
    twoFactorClient(),
  ],
});
