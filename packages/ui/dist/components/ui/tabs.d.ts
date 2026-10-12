import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
declare function Tabs({ className, orientation, ...props }: TabsPrimitive.Root.Props): any;
declare const tabsListVariants: any;
declare function TabsList({ className, variant, ...props }: TabsPrimitive.List.Props & {
    variant?: "default" | "line";
}): any;
declare function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props): any;
declare function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props): any;
export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
//# sourceMappingURL=tabs.d.ts.map