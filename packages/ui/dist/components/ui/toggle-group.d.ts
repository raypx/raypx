import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type ToggleOptions } from "#components/ui/toggle";
declare function ToggleGroup({ className, variant, size, spacing, orientation, children, ...props }: ToggleGroupPrimitive.Props & ToggleOptions & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
}): any;
declare function ToggleGroupItem({ className, children, variant, size, ...props }: TogglePrimitive.Props & ToggleOptions): any;
export { ToggleGroup, ToggleGroupItem };
//# sourceMappingURL=toggle-group.d.ts.map