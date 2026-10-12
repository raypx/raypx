import { Menu as MenuPrimitive } from "@base-ui/react/menu";
declare function DropdownMenu({ ...props }: MenuPrimitive.Root.Props): any;
declare function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props): any;
declare function DropdownMenuContent({ align, alignOffset, side, sideOffset, className, ...props }: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">): any;
declare function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props): any;
declare function DropdownMenuLabel({ className, inset, ...props }: MenuPrimitive.GroupLabel.Props & {
    inset?: boolean;
}): any;
declare function DropdownMenuItem({ className, inset, variant, ...props }: MenuPrimitive.Item.Props & {
    inset?: boolean;
    variant?: "default" | "destructive";
}): any;
declare function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props): any;
declare function DropdownMenuRadioItem({ className, children, inset, ...props }: MenuPrimitive.RadioItem.Props & {
    inset?: boolean;
}): any;
declare const DropdownMenuSeparator: any;
declare const DropdownMenuShortcut: any;
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, };
//# sourceMappingURL=dropdown-menu.d.ts.map