import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { loadAccount, type AccountState } from "../../lib/account";

const AccountContext = createContext<AccountState>({ status: "loading" });
export const useDesktopAccount = () => useContext(AccountContext);

/** Hide and dispose account-owned features before checking a potentially changed cookie. */
export function DesktopAccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountState>({ status: "loading" });
  const accountId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      setAccount({ status: "loading" });
      const next = await loadAccount();
      if (!active || revision !== current) return;
      const id = next.status === "signed_in" ? next.profile.id : null;
      if (id !== accountId.current) {
        router.clearCache();
        await router.invalidate({ sync: true });
        if (!active || revision !== current) return;
        accountId.current = id;
      }
      setAccount(next);
    };
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      revision++;
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);
  return <AccountContext value={account}>{children}</AccountContext>;
}
