import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/ui/dialog";
import { useTranslations } from "../../i18n.js";
import { BrowserAuthorization } from "../auth/components/browser-login.js";

export function ReauthorizeHost() {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="mt-3" />}>
        {t("daemonReauthorize")}
      </DialogTrigger>
      <DialogContent closeLabel={c("close")}>
        <DialogHeader>
          <DialogTitle>{t("daemonReauthorize")}</DialogTitle>
          <DialogDescription>{t("daemonReauthorizeHint")}</DialogDescription>
        </DialogHeader>
        {open && (
          <BrowserAuthorization
            reauthorizeHost
            onAuthorized={() => {
              window.dispatchEvent(new Event("raypx:remote-change"));
              setOpen(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
