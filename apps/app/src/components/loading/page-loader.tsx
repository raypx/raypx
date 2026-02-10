import { IconLoader } from "@tabler/icons-react";

interface PageLoaderProps {
  text?: string;
}

export function PageLoader({ text = "Loading..." }: PageLoaderProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <IconLoader className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    </div>
  );
}

export function FullPageLoader({ text = "Loading..." }: PageLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <IconLoader className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
    </div>
  );
}

export function InlineLoader({ text }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <IconLoader className="h-4 w-4 animate-spin" />
      {text && <span className="text-sm">{text}</span>}
    </div>
  );
}
