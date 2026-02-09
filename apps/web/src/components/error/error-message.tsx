import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { Button } from "@raypx/ui/components/button";
import type { TablerIcon } from "@raypx/ui/components/icon";
import { Icon } from "@raypx/ui/components/icon";
import { IconAlertCircle, IconCircleX, IconInfoCircle, IconTriangle } from "@tabler/icons-react";

interface ErrorMessageProps {
  title?: string;
  message: string;
  variant?: "error" | "warning" | "info";
  onRetry?: () => void;
  retryText?: string;
}

export function ErrorMessage({
  title,
  message,
  variant = "error",
  onRetry,
  retryText = "Try Again",
}: ErrorMessageProps) {
  const icons = {
    error: IconCircleX,
    warning: IconTriangle,
    info: IconInfoCircle,
  };

  const variants = {
    error: "destructive",
    warning: "default",
    info: "default",
  } as const;

  const icon = icons[variant];

  return (
    <Alert variant={variants[variant]}>
      <Icon className="h-4 w-4" icon={icon} />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="space-y-2">
        <p>{message}</p>
        {onRetry && (
          <Button className="mt-2" onClick={onRetry} size="sm" variant="outline">
            {retryText}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function PageError({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again later.",
  onRetry,
}: ErrorMessageProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <IconCircleX className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        {onRetry && (
          <Button onClick={onRetry} variant="default">
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = IconAlertCircle,
  title,
  message,
  action,
  actionLabel,
}: {
  icon?: TablerIcon;
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-8 w-8 text-muted-foreground" icon={icon} />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
        {action && actionLabel && (
          <Button onClick={action} variant="default">
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
