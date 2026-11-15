import { useQuery } from "@tanstack/react-query";
import { agentsClient } from "../../agents/client.js";
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
  if (returnTo === "/agents") return { to: destination };
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
  const router = useRouter();
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.searchStr });
  const configuration = useQuery({
    queryKey: ["configuration", "public"],
    queryFn: ({ signal }) => agentsClient.configuration.public({}, { signal }),
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  return (
    <SharedAuthForm
      bootstrap={configuration.data?.bootstrap === true}
      setupTokenRequired={
        configuration.data?.bootstrap === true && configuration.data.setupTokenRequired
      }
      key={mode}
      mode={mode}
      compact
      backLabel={null}
      client={authClient}
      webUrl={webUrl}
      search={search}
      onSignedIn={async () => {
        await router.invalidate();
        await navigate({ to: desktopReturnTo(new URLSearchParams(search).get("returnTo")) });
      }}
      LinkComponent={AuthLink}
    />
  );
}
