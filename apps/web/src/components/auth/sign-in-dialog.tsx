import { useAuth } from "@raypx/auth";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components";
import { IconMail } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { OrDivider } from "~/layouts/auth/or-divider";
import { SocialProviders } from "~/layouts/auth/social-providers";

interface SignInDialogProps {
  children: ReactNode;
}

export function SignInDialog({ children }: SignInDialogProps) {
  const [open, setOpen] = useState(false);
  const { redirectTo } = useAuth();

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={children} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center font-semibold text-2xl">Sign In</DialogTitle>
          <DialogDescription className="text-center">Sign in to your account</DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          <SocialProviders redirectTo={redirectTo} />

          <OrDivider />

          <Link to="/signin">
            <Button className="w-full" onClick={() => setOpen(false)} variant="default">
              <IconMail className="mr-2 size-4" />
              Sign in with Email
            </Button>
          </Link>

          <div className="pt-2 text-center text-muted-foreground text-sm">
            Don't have an account?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-primary"
              onClick={() => setOpen(false)}
              to="/signup"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
