import { createContext } from "react";
import type { AnyAuthClient } from "../auth";
import type { PasswordValidation } from "../utils/password";
import type { AuthHooks } from "./hooks";

export type CredentialsOptions = {
  /**
   * Enable or disable the Confirm Password input
   * @default false
   */
  confirmPassword?: boolean;

  /**
   * Enable or disable Forgot Password flow
   * @default true
   */
  forgotPassword?: boolean;

  /**
   * Customize the password validation
   */
  passwordValidation?: PasswordValidation;

  /**
   * Enable or disable Remember Me checkbox
   * @default false
   */
  rememberMe?: boolean;

  /**
   * Enable or disable Username support
   * @default false
   */
  username?: boolean;
};

export type AuthContextType = {
  auth: AnyAuthClient;
  redirectTo: string;
  navigate: (href: string) => void;
  onSessionChange?: () => void | Promise<void>;
  replace: (href: string) => void;
  hooks: AuthHooks;
  credentials?: CredentialsOptions;
};

export const AuthContext = createContext<AuthContextType | null>(null);
