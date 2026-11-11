import { analytics } from "../../analytics/client.js";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
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

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const session = authClient.useSession();
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = desktopReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      compact
      backLabel={null}
      client={authClient}
      webUrl={webUrl}
      search={search}
      onSignedIn={async () => {
        analytics.capture("sign_in_succeeded");
        await session.refetch();
        await router.invalidate();
        await navigate({ to: returnTo });
      }}
      LinkComponent={AuthLink}
    />
  );
}
