import { useId, useState } from "react";
import { useAuthActions } from "@raypx/auth/hooks";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/ui/dialog";
import { authClient, webUrl } from "../auth/client";

/** Refresh the browser session in place; signing out would cancel account work. */
export function ReauthorizeHost({ email }: { email: string }) {
  const t = useTranslations("tasks"),
    a = useTranslations("auth"),
    c = useTranslations("common"),
    locale = useLocale(),
    id = useId();
  const session = authClient.useSession();
  const auth = useAuthActions({ client: authClient, webUrl, locale });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const error = !auth.error
    ? null
    : auth.error.kind === "auth" && auth.error.key !== "generic"
      ? a(auth.error.key)
      : c(auth.error.kind === "network" ? "networkError" : "error");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (auth.busy) return;
        setOpen(value);
        setPassword("");
        auth.clearError();
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="mt-3" />}>
        {t("daemonReauthorize")}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("daemonReauthorize")}</DialogTitle>
          <DialogDescription>{t("daemonReauthorizeHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (auth.busy) return;
            const value = password;
            setPassword("");
            void auth.signIn({ email, password: value }, async () => {
              await session.refetch();
              window.dispatchEvent(new Event("raypx:remote-change"));
              setOpen(false);
            });
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={`${id}-email`}>{a("email")}</label>
            <Input id={`${id}-email`} type="email" autoComplete="username" value={email} readOnly />
          </div>
          <div className="grid gap-2">
            <label htmlFor={`${id}-password`}>{a("password")}</label>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={auth.busy}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={auth.busy}
              onClick={() => {
                setPassword("");
                auth.clearError();
                setOpen(false);
              }}
            >
              {c("cancel")}
            </Button>
            <Button type="submit" disabled={auth.busy}>
              {c(auth.busy ? "working" : "signIn")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
