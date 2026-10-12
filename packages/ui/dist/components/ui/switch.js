import { jsx as _jsx } from "react/jsx-runtime";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "../../lib/utils";
function Switch({ className, size = "default", ...props }) {
    return (_jsx(BaseSwitch.Root, { "data-slot": "switch", className: cn("relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-checked:bg-primary", size === "sm" ? "h-5 w-9" : "h-6 w-11", className), ...props, children: _jsx(BaseSwitch.Thumb, { className: cn("pointer-events-none block rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-full", size === "sm" ? "size-4" : "size-5") }) }));
}
export { Switch };
//# sourceMappingURL=switch.js.map