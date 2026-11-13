export { passkeyClient } from "@better-auth/passkey/client";
export { createAuthClient } from "better-auth/react";
export { adminClient, emailOTPClient, twoFactorClient } from "better-auth/client/plugins";
export { PasswordChangeDialog } from "./client/password-change-dialog.js";
export { PasswordSetupEmail } from "./client/password-setup-email.js";
export {
  AuthForm,
  type AuthFormLinkProps,
  type AuthFormProps,
  type AuthMode,
} from "./client/auth-form.js";
