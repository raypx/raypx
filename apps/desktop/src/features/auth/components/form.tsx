import { analytics } from "../../analytics/client.ts";
import { Logo } from "@raypx/ui/logo";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { authClient, webUrl } from "../client.ts";
import { desktopReturnTo } from "../return-to.ts";

function AuthLink({ to, children, className }: AuthFormLinkProps) {
  const search = useLocation({ select: (location) => location.searchStr });
  const returnTo = desktopReturnTo(new URLSearchParams(search).get("returnTo"));
  return (
    <Link
      to={to === "account" ? returnTo : `/${to}`}
      {...(to === "account" || returnTo === "/" ? {} : { search: { returnTo } })}
      className={className}
    >
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
  const login = mode === "login";
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      compact={login}
      headingLeading={
        login ? (
          <Link
            to="/"
            className="mb-2 inline-flex self-start rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <Logo className="text-sm [&_[data-slot=logo-mark]]:size-6" />
          </Link>
        ) : undefined
      }
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
