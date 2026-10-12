import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { X } from "@phosphor-icons/react";
import { Button } from "./components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, } from "./components/ui/dialog";
import { SheetContent } from "./components/ui/sheet";
/** Application-facing dialog naming and busy-state dismissal policy. */
export function Modal({ title, description, closeLabel, trigger, children, open, onOpenChange, drawer = false, busy = false, }) {
    const content = (_jsxs(_Fragment, { children: [_jsxs(DialogHeader, { className: "pr-8", children: [_jsx(DialogTitle, { children: title }), description ? _jsx(DialogDescription, { children: description }) : null] }), _jsx(DialogClose, { render: _jsx(Button, { size: "icon-sm", variant: "ghost", className: "absolute top-3 right-3", "aria-label": closeLabel, disabled: busy, children: _jsx(X, { "aria-hidden": "true" }) }) }), children] }));
    return (_jsxs(Dialog, { open: open, onOpenChange: (next) => {
            if (!busy || next)
                onOpenChange(next);
        }, children: [_jsx(DialogTrigger, { render: trigger }), drawer ? (_jsx(SheetContent, { side: "left", showCloseButton: false, className: "max-w-72 overflow-y-auto p-5", children: content })) : (_jsx(DialogContent, { showCloseButton: false, className: "max-h-[calc(100svh-2rem)] overflow-y-auto", children: content }))] }));
}
//# sourceMappingURL=modal.js.map