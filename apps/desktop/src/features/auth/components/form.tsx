import { Link, useLocation } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { authClient, webUrl } from "../client.js";
import { desktopReturnTo } from "../return-to.js";

function authLinkLocation(to: AuthFormLinkProps["to"], returnTo: string) {
  if (to === "account") return { to: returnTo };
  const destination = `/${to}` as const;
  if (returnTo === "/") return { to: destination };
  return { to: destination, search: { returnTo } };
}

function AuthLink({ to, children, className }: AuthFormLinkProps) {
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = desktopReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <Link {...authLinkLocation(to, returnTo)} className={className}>
      {children}
    </Link>
  );
}

export function AuthForm({ mode }: { mode: Exclude<AuthMode, "login"> }) {
  const search = useLocation({ select: (location) => location.searchStr });
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      compact
      backLabel={null}
      client={authClient}
      webUrl={webUrl}
      search={search}
      onSignedIn={() => {}}
      LinkComponent={AuthLink}
    />
  );
}
