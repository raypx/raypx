import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { authClient, webUrl } from "../client";

function AuthLink({ to, children, className }: AuthFormLinkProps) {
  return (
    <Link to={to === "account" ? "/account" : `/${to}`} className={className}>
      {children}
    </Link>
  );
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.searchStr });
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      client={authClient}
      webUrl={webUrl}
      search={search}
      onSignedIn={async () => {
        await router.invalidate();
        await navigate({ to: "/account" });
      }}
      LinkComponent={AuthLink}
    />
  );
}
