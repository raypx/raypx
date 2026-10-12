import { UserCircle } from "@phosphor-icons/react";
import { useDesktopTranslations } from "../../i18n/client";
import { Avatar } from "@voidmix/ui/avatar";
import { useDesktopAccount } from "./account-provider";

export function AccountControl() {
  const t = useDesktopTranslations("common");
  const account = useDesktopAccount();

  const profile = account.status === "signed_in" ? account.profile : null;
  const label = profile
    ? profile.displayName
    : t(
        account.status === "loading"
          ? "accountLoading"
          : account.status === "unconfigured"
            ? "accountUnconfigured"
            : account.status === "signed_out"
              ? "signedOut"
              : "accountUnavailable",
      );

  return (
    <div
      className="account-control group-data-[collapsed]/desktop-shell:hidden flex items-center gap-2.5 py-3 px-2.5 border-t border-border [&_>_span]:flex [&_>_span]:min-w-0 [&_>_span]:flex-col [&_strong]:truncate [&_strong]:text-[12px] [&_strong]:font-medium [&_small]:wrap-anywhere [&_small]:text-[12px] [&_small]:text-muted-foreground"
      aria-label={t("account")}
    >
      {profile ? (
        <Avatar name={profile.displayName} size="small" />
      ) : (
        <UserCircle size={28} aria-hidden="true" />
      )}
      <span aria-live="polite">
        <strong>{label}</strong>
        {profile ? <small title={profile.email}>{profile.email}</small> : null}
      </span>
    </div>
  );
}
