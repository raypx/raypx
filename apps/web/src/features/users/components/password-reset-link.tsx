import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
} from "@raypx/ui/components/ui/dialog";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { CopyIcon } from "@raypx/icons/copy";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { useTranslations } from "../../../i18n.js";
import { administrationClient } from "../../admin/client.js";
import { publicConfigurationQuery } from "../../config/client.js";
import { webUrl } from "../../auth/client.js";

export function PasswordResetLink({
  userId,
  email,
  disabled,
}: {
  userId: string;
  email: string;
  disabled: boolean;
}) {
  const t = useTranslations("users");
  const c = useTranslations("common");
  const locale = useLocale();
  const id = useId();
  const generation = useRef(0);
  const config = useQuery(publicConfigurationQuery());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  async function issue() {
    if (busy || link) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await administrationClient.issuePasswordReset({ userId });
      setLink({
        url: `${webUrl}/reset-password?token=${encodeURIComponent(result.token)}`,
        expiresAt: result.expiresAt,
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!link) return;
    const current = generation.current;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(link.url);
      if (generation.current === current) setCopied(true);
    } catch {
      if (generation.current === current) setCopyFailed(true);
    }
  }
  if (config.data?.mailConfigured !== false) return null;
  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {t("resetLink")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) {
            ++generation.current;
            setLink(null);
            setFailed(false);
            setCopied(false);
            setCopyFailed(false);
          }
        }}
      >
        <DialogContent
          closeLabel={t("closeResetLink")}
          aria-busy={busy}
          className="gap-5 sm:max-w-lg"
        >
          <DialogHeader className="pr-6">
            <DialogTitle>{t("resetLink")}</DialogTitle>
            <DialogDescription className="leading-6 wrap-anywhere">
              {t("resetLinkHint", { email })}
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={id}>{t("resetLinkOnce")}</FieldLabel>
                <Input
                  id={id}
                  type="password"
                  readOnly
                  value={link.url}
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <p className="text-xs text-muted-foreground">
                  <time
                    dateTime={link.expiresAt}
                    title={new Date(link.expiresAt).toLocaleString(locale)}
                  >
                    {t("resetLinkExpires", {
                      time: new Date(link.expiresAt).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </time>
                </p>
              </Field>
              <Button onClick={() => void copy()}>
                <CopyIcon data-icon="inline-start" aria-hidden="true" />
                {t(copied ? "resetLinkCopied" : "copyResetLink")}
              </Button>
              {copyFailed && (
                <p role="alert" className="text-sm text-destructive-text">
                  {t("resetLinkCopyFailed")}
                </p>
              )}
            </div>
          ) : (
            <Button disabled={busy} onClick={() => void issue()}>
              {busy && <SpinnerIcon aria-hidden="true" className="motion-safe:animate-spin" />}
              {busy ? c("working") : t("issueResetLink")}
            </Button>
          )}
          {failed && (
            <Alert variant="destructive">
              <AlertDescription>{t("resetLinkFailed")}</AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
