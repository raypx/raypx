import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
declare function TooltipProvider({ delay, ...props }: TooltipPrimitive.Provider.Props): any;
declare function Tooltip({ ...props }: TooltipPrimitive.Root.Props): any;
declare function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props): any;
declare function TooltipContent({ className, side, sideOffset, align, alignOffset, children, ...props }: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">): any;
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
//# sourceMappingURL=tooltip.d.ts.map