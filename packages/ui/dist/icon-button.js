import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
export function IconButton({ label, hint = label, size = "icon", variant = "ghost", children, ...props }) {
    return (_jsxs(Tooltip, { disabled: props.disabled, children: [_jsx(TooltipTrigger, { "data-slot": "button", render: _jsx(Button, { ...props, "aria-label": label, "aria-description": hint === label ? undefined : hint, size: size, variant: variant }), children: children }), _jsx(TooltipContent, { role: "tooltip", children: hint })] }));
}
//# sourceMappingURL=icon-button.js.map