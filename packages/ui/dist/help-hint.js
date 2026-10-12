import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Info } from "@phosphor-icons/react";
import { Button } from "./components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger, } from "./components/ui/popover";
export function HelpHint({ label, description }) {
    return (_jsxs(Popover, { children: [_jsx(PopoverTrigger, { "data-slot": "button", render: _jsx(Button, { "aria-label": label, size: "icon-sm", variant: "ghost" }), children: _jsx(Info, { "aria-hidden": "true" }) }), _jsxs(PopoverContent, { children: [_jsx(PopoverTitle, { children: label }), _jsx(PopoverDescription, { children: description })] })] }));
}
//# sourceMappingURL=help-hint.js.map