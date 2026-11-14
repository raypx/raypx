import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const config = useQuery(publicConfigurationQuery());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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
            setLink(null);
            setFailed(false);
          }
        }}
      >
        <DialogContent closeLabel={t("closeResetLink")}>
          <DialogHeader>
            <DialogTitle>{t("resetLink")}</DialogTitle>
            <DialogDescription>{t("resetLinkHint", { email })}</DialogDescription>
          </DialogHeader>
          {link ? (
            <Field>
              <FieldLabel htmlFor={`reset-${userId}`}>{t("resetLinkOnce")}</FieldLabel>
              <Input
                id={`reset-${userId}`}
                readOnly
                value={link.url}
                autoComplete="off"
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="text-sm text-muted-foreground">
                {t("resetLinkExpires", { time: link.expiresAt })}
              </p>
            </Field>
          ) : (
            <Button disabled={busy} onClick={() => void issue()}>
              {t("issueResetLink")}
            </Button>
          )}
          {failed && <p role="alert">{t("resetLinkFailed")}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
