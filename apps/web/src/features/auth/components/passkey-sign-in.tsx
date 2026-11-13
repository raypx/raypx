import { useRef, useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";
import { authClient } from "../client.js";

export function PasskeySignIn({
  onSignedIn,
  disabled,
}: {
  onSignedIn: () => Promise<void>;
  disabled: boolean;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const active = useRef(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  async function signIn() {
    if (active.current) return;
    active.current = true;
    setWorking(true);
    setFailed(false);
    try {
      if (!signedIn) {
        const result = await authClient.signIn.passkey();
        if (result.error || !result.data) throw new Error("Passkey sign-in failed");
        setSignedIn(true);
      }
      await onSignedIn();
    } catch {
      setFailed(true);
    } finally {
      active.current = false;
      setWorking(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="xl"
        disabled={working || disabled}
        onClick={() => void signIn()}
      >
        {signedIn ? c("retry") : t("methods.passkeySignIn")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t(signedIn ? "signInCompletionFailed" : "methods.failed")}
        </p>
      )}
    </div>
  );
}
