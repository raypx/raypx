import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@raypx/ui/components/ui/button";
import type { SocialProvider } from "@raypx/core/auth";
import { useTranslations } from "../../../i18n.js";
import { apiUrl, authClient, webUrl } from "../client.js";

const providers = ["google", "github"] as const;
const names = { google: "Google", github: "GitHub" } as const;
const settings = "/projects#settings/password";

type LinkedAccount = { id: string; providerId: string };

export function SignInMethods({
  accountId,
  accounts,
  reloadAccounts,
}: {
  accountId: string;
  accounts: readonly LinkedAccount[];
  reloadAccounts: () => Promise<void>;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const methods = useQuery({
    queryKey: ["sign-in-methods", apiUrl, accountId],
    retry: false,
    queryFn: async ({ signal }) => {
      const options = { signal, cache: "no-store" as const };
      const [passkeys, enabled] = await Promise.all([
        authClient.passkey.listUserPasskeys({ fetchOptions: options }),
        authClient.$fetch<{ providers: SocialProvider[] }>("/social-providers", options),
      ]);
      if (
        passkeys.error ||
        enabled.error ||
        !enabled.data ||
        !passkeys.data ||
        passkeys.data.some((key) => key.userId !== accountId)
      )
        throw new Error("Sign-in methods unavailable");
      return { passkeys: passkeys.data, enabled: enabled.data.providers };
    },
  });
  async function change(action: () => Promise<{ error?: unknown }>, refresh = true) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const result = await action();
      if (result.error) throw new Error("Sign-in method update failed");
      if (refresh) await Promise.all([reloadAccounts(), methods.refetch({ throwOnError: true })]);
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (methods.isPending) return <p role="status">{c("loading")}</p>;
  const data = methods.data;
  if (!data)
    return (
      <div className="grid justify-items-start gap-2">
        <p role="alert">{t("methods.failed")}</p>
        <Button variant="outline" onClick={() => void methods.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  const usableAccounts = accounts.filter(
    ({ providerId }) =>
      providerId === "credential" || data.enabled.some((provider) => provider === providerId),
  );
  return (
    <section className="grid gap-3 border-t pt-4">
      <h3 className="text-sm font-semibold">{t("methods.title")}</h3>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("methods.failed")}
        </p>
      )}
      {providers
        .filter(
          (provider) =>
            data.enabled.includes(provider) ||
            accounts.some(({ providerId }) => providerId === provider),
        )
        .map((provider) => {
          const linked = accounts.find(({ providerId }) => providerId === provider);
          return (
            <div key={provider} className="flex items-center justify-between gap-3">
              <span>{names[provider]}</span>
              {linked ? (
                <Button
                  variant="outline"
                  disabled={busy || !usableAccounts.some(({ id }) => id !== linked.id)}
                  onClick={() =>
                    void change(() => authClient.unlinkAccount({ accountId: linked.id }))
                  }
                >
                  {t("methods.remove")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void change(
                      () =>
                        authClient.linkSocial({
                          provider,
                          callbackURL: `${webUrl}${settings}`,
                          errorCallbackURL: `${webUrl}${settings}`,
                        }),
                      false,
                    )
                  }
                >
                  {t("methods.link")}
                </Button>
              )}
            </div>
          );
        })}
      {data.passkeys.map((key) => (
        <div key={key.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 break-words">{key.name || t("methods.passkey")}</span>
          <Button
            variant="outline"
            disabled={busy || !usableAccounts.length}
            onClick={() => void change(() => authClient.passkey.deletePasskey({ id: key.id }))}
          >
            {t("methods.remove")}
          </Button>
        </div>
      ))}
      <Button
        className="justify-self-start"
        variant="outline"
        disabled={busy}
        onClick={() => void change(() => authClient.passkey.addPasskey())}
      >
        {t("methods.addPasskey")}
      </Button>
    </section>
  );
}
