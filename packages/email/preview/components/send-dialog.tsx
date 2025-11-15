import { Button } from "@raypx/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog";
import { Input } from "@raypx/ui/components/input";
import { Label } from "@raypx/ui/components/label";

type SendDialogProps = {
  open: boolean;
  templateName: string;
  testEmail: string;
  lastEmail: string | null;
  sending: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailChange: (email: string) => void;
  onSend: () => void;
};

export function SendDialog({
  open,
  templateName,
  testEmail,
  lastEmail,
  sending,
  onOpenChange,
  onEmailChange,
  onSend,
}: SendDialogProps) {
  const handleApplyLastEmail = () => {
    if (lastEmail) {
      onEmailChange(lastEmail);
    }
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) onEmailChange("");
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>
            Send <span className="font-medium text-foreground">{templateName}</span> to a test email
            address.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="test-email">Recipient Email</Label>
            <Input
              autoFocus
              disabled={sending}
              id="test-email"
              onChange={(e) => {
                onEmailChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !sending && testEmail) {
                  onSend();
                }
              }}
              placeholder="test@example.com"
              type="email"
              value={testEmail}
            />
          </div>

          {/* Last email button */}
          {lastEmail && lastEmail !== testEmail && (
            <div className="flex items-center gap-2">
              <Button
                className="h-8 text-xs"
                disabled={sending}
                onClick={handleApplyLastEmail}
                type="button"
                variant="outline"
              >
                Use last email: {lastEmail}
              </Button>
            </div>
          )}

          {/* Info message */}
          <div className="rounded-lg border border-border bg-accent/50 p-3">
            <p className="text-xs text-accent-foreground">
              💡 Configure{" "}
              <code className="rounded-md bg-background px-1.5 py-0.5 text-foreground font-mono">
                RESEND_API_KEY
              </code>{" "}
              or SMTP credentials to send real emails. Otherwise, emails will be logged to console.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={sending}
            onClick={() => {
              onOpenChange(false);
              onEmailChange("");
            }}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={sending || !testEmail} onClick={onSend}>
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
