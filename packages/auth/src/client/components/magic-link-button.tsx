import { Button } from "@raypx/ui/components/button";
import { cn } from "@raypx/ui/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { LockIcon, MailIcon } from "lucide-react";

type MagicLinkButtonProps = {
  className?: string;
  currentView?: "magic-link" | "sign-in";
  disabled?: boolean;
};

export function MagicLinkButton({
  className,
  currentView = "sign-in",
  disabled = false,
}: MagicLinkButtonProps) {
  const navigate = useNavigate();

  const isMagicLinkView = currentView === "magic-link";

  const handleClick = () => {
    const searchParams = typeof window !== "undefined" ? window.location.search : "";
    navigate({
      to: isMagicLinkView ? "/sign-in" : "/magic-link",
      search: searchParams,
    });
  };

  return (
    <Button
      className={cn("w-full", className)}
      disabled={disabled}
      onClick={handleClick}
      type="button"
      variant="secondary"
    >
      {isMagicLinkView ? (
        <LockIcon className="mr-2 size-4" />
      ) : (
        <MailIcon className="mr-2 size-4" />
      )}
      Sign in with {isMagicLinkView ? "Password" : "Magic Link"}
    </Button>
  );
}
