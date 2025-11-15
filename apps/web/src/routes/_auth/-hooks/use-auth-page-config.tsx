import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

export type AuthPageFooterType = "sign-in" | "sign-up" | "go-back" | "none" | ReactNode;

export type AuthPageConfig = {
  footerType?: AuthPageFooterType;
};

type AuthPageConfigContextType = {
  config: AuthPageConfig;
  setConfig: (config: AuthPageConfig) => void;
};

const AuthPageConfigContext = createContext<AuthPageConfigContextType | null>(null);

/**
 * Provider component for auth page configuration
 * Should be used in the parent _auth route layout
 */
export function AuthPageConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthPageConfig>({});

  return (
    <AuthPageConfigContext.Provider value={{ config, setConfig }}>
      {children}
    </AuthPageConfigContext.Provider>
  );
}

/**
 * Hook to set auth page footer configuration
 * Should be called in child auth pages (sign-in, sign-up, etc.)
 *
 * Note: title and description should be set in route head for SEO
 *
 * @example
 * ```tsx
 * // In route definition
 * export const Route = createFileRoute("/_auth/sign-in")({
 *   head: () => ({
 *     meta: [{ title: "Sign In - Raypx", description: "Sign in to your account" }],
 *   }),
 *   component: SignInPage
 * });
 *
 * // In component
 * function SignInPage() {
 *   useAuthPageConfig({
 *     footerType: "sign-in"
 *   });
 *
 *   return <SignInForm />;
 * }
 * ```
 */
export function useAuthPageConfig(config: AuthPageConfig) {
  const context = useContext(AuthPageConfigContext);

  if (!context) {
    throw new Error("useAuthPageConfig must be used within AuthPageConfigProvider");
  }

  useEffect(() => {
    context.setConfig(config);

    // Cleanup: reset config when component unmounts
    return () => {
      context.setConfig({});
    };
  }, [config.footerType, context]);
}

/**
 * Hook to read current auth page configuration
 * Used by the parent layout to render AuthLayout with proper config
 */
export function useAuthPageConfigValue(): AuthPageConfig {
  const context = useContext(AuthPageConfigContext);

  if (!context) {
    throw new Error("useAuthPageConfigValue must be used within AuthPageConfigProvider");
  }

  return context.config;
}
