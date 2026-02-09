import { Button } from "@raypx/ui/components/button";
import { cn } from "@raypx/ui/lib/utils";
import { IconClock, IconMail } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";

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
        <IconClock className="mr-2 size-4" />
      ) : (
        <IconMail className="mr-2 size-4" />
      )}
      Sign in with {isMagicLinkView ? "Password" : "Magic Link"}
    </Button>
  );
}
