import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon } from "@raypx/icons/check";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { cn } from "#lib/utils";
import { controlSizeVariants, type ControlSize } from "../../control-size.js";

const Combobox = ComboboxPrimitive.Root;
const ComboboxValue = ComboboxPrimitive.Value;
const ComboboxCollection = ComboboxPrimitive.Collection;

function ComboboxTrigger({
  className,
  children,
  size = "default",
  ...props
}: ComboboxPrimitive.Trigger.Props & { size?: ControlSize }) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      data-size={size}
      className={cn(
        "inline-flex min-w-0 items-center justify-between gap-2 border border-input bg-background px-2.5 text-sm outline-none transition-[background-color,border-color,box-shadow] hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-popup-open:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        controlSizeVariants({ size }),
        size === "sm" && "text-xs [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxInput({
  className,
  controlSize = "default",
  ...props
}: ComboboxPrimitive.Input.Props & { controlSize?: ControlSize }) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      data-size={controlSize}
      className={cn(
        "w-full min-w-0 border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        controlSizeVariants({ size: controlSize }),
        controlSize === "sm" && "md:text-xs",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "flex max-h-(--available-height) w-(--anchor-width) min-w-56 max-w-(--available-width) origin-(--transform-origin) flex-col gap-1 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/10 outline-none transition-[opacity,transform] duration-150 ease-out data-starting-style:translate-y-1 data-starting-style:opacity-0 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "min-h-0 max-h-72 scroll-py-1 overflow-y-auto overscroll-contain outline-none",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex min-h-8 cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 inline-flex items-center justify-center">
        <CheckIcon aria-hidden="true" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn("py-1", className)}
      {...props}
    />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-3 py-6 text-center text-sm text-muted-foreground empty:hidden", className)}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxValue,
  ComboboxCollection,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxEmpty,
};
