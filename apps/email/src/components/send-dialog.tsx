import { Button } from "@raypx/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";
import { toast } from "@raypx/ui/components/toast";
import { cn } from "@raypx/ui/lib/utils";
import { IconAlertCircle, IconCircleCheck, IconLoader } from "@tabler/icons-react";

import { useEffect, useState } from "react";
import { useLastEmail } from "../hooks/use-last";
import { useSend } from "../hooks/use-send";

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  html: string;
  templateName: string;
}

export function SendDialog({ open, onOpenChange, html: _html, templateName }: SendDialogProps) {
  const { lastEmail, saveLastEmail } = useLastEmail();
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("hello@raypx.com");
  const [subject, setSubject] = useState("");
  const { send, sending } = useSend();
  const [sendStatus, setSendStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Pre-fill recipient email when dialog opens
  useEffect(() => {
    if (open && lastEmail && !to) {
      setTo(lastEmail);
    }
  }, [open, lastEmail, to]);

  const handleSend = async () => {
    if (!to) {
      setErrorMessage("Please enter a recipient email");
      setSendStatus("error");
      return;
    }

    if (!subject) {
      setErrorMessage("Please enter a subject");
      setSendStatus("error");
      return;
    }

    setSendStatus("idle");

    try {
      await send(templateName, to, subject);
      saveLastEmail(to);
      setSendStatus("success");
      toast.success(`Email sent to ${to}`);
      setTimeout(() => {
        onOpenChange(false);
        setSendStatus("idle");
        setTo("");
        setSubject("");
      }, 2000);
    } catch (error) {
      setSendStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send email");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>Send "{templateName}" template via Resend</DialogDescription>
        </DialogHeader>

        {sendStatus !== "idle" && (
          <div
            className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", {
              "bg-green-500/10 text-green-400": sendStatus === "success",
              "bg-red-500/10 text-red-400": sendStatus === "error",
            })}
          >
            {sendStatus === "success" ? (
              <>
                <IconCircleCheck className="h-4 w-4" />
                <span>Email sent successfully!</span>
              </>
            ) : (
              <>
                <IconAlertCircle className="h-4 w-4" />
                <span>{errorMessage}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* From */}
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="from">
              From
            </Label>
            <Input
              id="from"
              onChange={(e) => setFrom(e.target.value)}
              placeholder="sender@example.com"
              type="email"
              value={from}
            />
            <p className="text-muted-foreground text-xs">Use a verified domain email in Resend</p>
          </div>

          {/* To */}
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="to">
              To
            </Label>
            <Input
              id="to"
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              type="email"
              value={to}
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label className="text-sm" htmlFor="subject">
              Subject
            </Label>
            <Input
              id="subject"
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              value={subject}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={sending || !to || !subject} onClick={handleSend}>
              {sending ? (
                <>
                  <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Email"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
