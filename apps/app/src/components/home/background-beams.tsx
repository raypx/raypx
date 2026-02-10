import { cn } from "@raypx/ui/lib/utils";

export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "mask-[radial-gradient(ellipse_at_center,transparent_20%,black)] absolute inset-0 h-full w-full bg-neutral-950",
        className,
      )}
    >
      <div className="mask-[linear-gradient(180deg,white,rgba(255,255,255,0))] absolute inset-0 bg-[url('https://assets.aceternity.com/grid.svg')] bg-center" />
      <div className="mask-[radial-gradient(ellipse_at_center,transparent_20%,black)] absolute inset-0 bg-neutral-950" />
    </div>
  );
};

// 简化版的 Grid Background，不依赖外部资源
export const GridBackground = ({ className }: { className?: string }) => {
  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-0 dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] dark:opacity-100" />
    </div>
  );
};
