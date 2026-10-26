import { analytics } from "../../analytics/client";
import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AuthForm as SharedAuthForm,
  type AuthFormLinkProps,
  type AuthMode,
} from "@raypx/auth/client";
import { authClient, webUrl } from "../client";
import { desktopReturnTo } from "../return-to";
import { useTranslations } from "@raypx/i18n/browser";

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
  const t = useTranslations("localWorkspace");
  return (
    <SharedAuthForm
      key={mode}
      mode={mode}
      backLabel={t("backToLocal")}
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
