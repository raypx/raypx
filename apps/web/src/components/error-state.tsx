import { Button } from "@raypx/ui/components/button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

export function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm">
      <p className="text-destructive">{message}</p>
      <Button disabled={retrying} onClick={onRetry} size="sm" variant="outline">
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}
