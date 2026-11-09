import type { ReactNode } from "react";
import { CheckIcon } from "@raypx/icons/check";
import { ClockIcon } from "@raypx/icons/clock";
import { FolderIcon } from "@raypx/icons/folder";
import { TerminalWindowIcon } from "@raypx/icons/terminal-window";
import { cn } from "@raypx/ui/lib/utils";
import { DotGrid } from "../../../components/artwork.tsx";

/**
 * Schematic artwork for the homepage workspace links. Shapes stay abstract so they never
 * read as the visitor's projects, requests, schedules or documents. Each piece reacts to
 * hover on its parent `group` link; nothing animates on its own.
 */

const line = "h-1.5 rounded-full bg-foreground/10";
const move =
  "motion-safe:transition-[translate,rotate,scale,width] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]";

function ArtFrame({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative isolate h-40 overflow-hidden border-b border-border bg-muted/40"
    >
      <DotGrid className="mask-[radial-gradient(ellipse_at_center,#000_20%,transparent_75%)]" />
      {children}
    </div>
  );
}

const treeRows = [
  { indent: "pl-0", width: "w-16", folder: true },
  { indent: "pl-4", width: "w-20", folder: true, selected: true },
  { indent: "pl-8", width: "w-14" },
  { indent: "pl-8", width: "w-20" },
  { indent: "pl-4", width: "w-12", folder: true },
] as const;

export function ProjectsArt() {
  return (
    <ArtFrame>
      <div
        className={cn(
          "absolute inset-x-6 top-7 -bottom-4 flex flex-col rounded-xl border border-border bg-background shadow-soft group-hover:-translate-y-1",
          move,
        )}
      >
        <div className="flex gap-1 border-b border-border px-3 py-2">
          <span className="size-1.5 rounded-full bg-foreground/15" />
          <span className="size-1.5 rounded-full bg-foreground/15" />
          <span className="size-1.5 rounded-full bg-foreground/15" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-36 shrink-0 flex-col gap-1 border-r border-border p-2">
            {treeRows.map((row, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1",
                  row.indent,
                  "selected" in row && "bg-foreground/5",
                )}
              >
                {"folder" in row ? (
                  <FolderIcon className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span
                  className={cn(
                    line,
                    row.width,
                    "selected" in row && "bg-foreground/25 group-hover:w-24",
                    move,
                  )}
                />
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
            <span className={cn(line, "w-1/3 bg-foreground/20")} />
            <span className={cn(line, "w-5/6 group-hover:w-2/3", move)} />
            <span className={cn(line, "w-2/3 group-hover:w-5/6", move)} />
            <span className={cn(line, "w-3/4")} />
            <span className={cn(line, "w-1/2 group-hover:w-3/5", move)} />
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

export function ApprovalsArt() {
  return (
    <ArtFrame>
      <div
        className={cn(
          "absolute inset-x-12 top-6 h-16 rounded-xl border border-border bg-background/50 group-hover:-translate-y-2 group-hover:scale-[0.97]",
          move,
        )}
      />
      <div
        className={cn(
          "absolute inset-x-9 top-9 h-16 rounded-xl border border-border bg-background/80 group-hover:-translate-y-1",
          move,
        )}
      />
      <div
        className={cn(
          "absolute inset-x-6 top-12 flex items-center gap-3 rounded-xl border border-border bg-background p-3 shadow-soft group-hover:translate-y-0.5",
          move,
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted/60">
          <TerminalWindowIcon className="size-4 text-muted-foreground" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={cn(line, "w-2/3 bg-foreground/20")} />
          <span className={cn(line, "w-1/2")} />
        </span>
        <span className="h-5 w-8 shrink-0 rounded-md border border-border" />
        <span
          className={cn(
            "grid h-5 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground group-hover:scale-110",
            move,
          )}
        >
          <CheckIcon className="size-3" />
        </span>
      </div>
    </ArtFrame>
  );
}

export function AutomationsArt() {
  return (
    <ArtFrame>
      <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
        <div className="relative flex items-center justify-between">
          <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/15" />
          {Array.from({ length: 7 }, (_, index) =>
            index === 3 ? (
              <span
                key={index}
                className={cn(
                  "relative grid size-9 place-items-center rounded-full border border-border bg-background shadow-soft group-hover:scale-110",
                  move,
                )}
              >
                <ClockIcon className={cn("size-4 group-hover:rotate-90", move)} />
              </span>
            ) : (
              <span
                key={index}
                className={cn(
                  "relative size-2.5 rounded-full border border-foreground/30 bg-background group-hover:scale-125",
                  move,
                )}
              />
            ),
          )}
        </div>
        <div className="mt-4 flex justify-between">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className="h-1 w-3 rounded-full bg-foreground/10" />
          ))}
        </div>
      </div>
    </ArtFrame>
  );
}

function Sheet({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "absolute top-7 left-1/2 flex w-44 flex-col gap-2 rounded-xl border border-border bg-background p-4",
        move,
        className,
      )}
    >
      <span className={cn(line, "w-1/2 bg-foreground/20")} />
      <span className={cn(line, "w-full")} />
      <span className={cn(line, "w-5/6")} />
      <span className={cn(line, "w-full")} />
      <span className={cn(line, "w-2/3")} />
      {children}
    </div>
  );
}

export function MemoryArt() {
  return (
    <ArtFrame>
      <Sheet className="-translate-x-[115%] rotate-[-5deg] opacity-60 group-hover:-translate-x-[125%] group-hover:rotate-[-9deg]" />
      <Sheet className="translate-x-[15%] rotate-[5deg] opacity-60 group-hover:translate-x-[25%] group-hover:rotate-[9deg]" />
      <Sheet className="-translate-x-1/2 shadow-soft group-hover:-translate-y-1">
        <span className="absolute -top-px right-4 h-6 w-4 bg-foreground/80 [clip-path:polygon(0_0,100%_0,100%_100%,50%_72%,0_100%)]" />
      </Sheet>
    </ArtFrame>
  );
}
