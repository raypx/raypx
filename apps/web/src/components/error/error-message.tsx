import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { Button } from "@raypx/ui/components/button";
import { AlertCircle, AlertTriangle, Info, XCircle } from "lucide-react";

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
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const variants = {
    error: "destructive",
    warning: "default",
    info: "default",
  } as const;

  const Icon = icons[variant];

  return (
    <Alert variant={variants[variant]}>
      <Icon className="h-4 w-4" />
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
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-4 max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
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
  icon: Icon = AlertCircle,
  title,
  message,
  action,
  actionLabel,
}: {
  icon?: React.ElementType;
  title: string;
  message: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-4 max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
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
