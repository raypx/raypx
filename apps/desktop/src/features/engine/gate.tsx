import type { ReactNode } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { useDesktopPlatform } from "../../lib/platform-context.js";
import { useDesktopEngine } from "./provider.js";
import { EngineNotice } from "./notice.js";
import { WindowDragRegion } from "../../components/window-drag-region.js";

/** First connection blocks local queries; later outages keep the mounted workspace intact. */
export function EngineGate({ children }: { children: ReactNode }) {
  const platform = useDesktopPlatform();
  const { engine, restart, connected } = useDesktopEngine();
  const t = useTranslations("common");
  if (!platform.isDesktop() || connected || engine.status === "ready") return children;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <WindowDragRegion />
      {engine.status === "starting" ? (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-32" />
        </div>
      ) : (
        <EngineNotice code={engine.code} restart={restart} />
      )}
    </main>
  );
}
