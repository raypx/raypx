import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { styledSlot } from "#lib/styled-slot";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CheckCircleIcon, InfoIcon, SpinnerIcon, WarningIcon, XCircleIcon, XIcon, } from "@phosphor-icons/react";
import { cn } from "#lib/utils";
import { Button } from "./button";
const toast = ToastPrimitive.createToastManager();
const defaultToastAction = _jsx(Button, { size: "sm", variant: "outline" });
const defaultToastClose = _jsx(Button, { size: "icon-sm", variant: "ghost" });
function ToastProvider({ ...props }) {
    return _jsx(ToastPrimitive.Provider, { ...props });
}
function ToastPortal({ ...props }) {
    return _jsx(ToastPrimitive.Portal, { "data-slot": "toast-portal", ...props });
}
const ToastViewport = styledSlot(ToastPrimitive.Viewport, "toast-viewport", "pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full");
const Toast = styledSlot(ToastPrimitive.Root, "toast", "group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-2xl border bg-popover text-popover-foreground shadow-lg outline-none select-none will-change-transform focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50", "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]", "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]", "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']", "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]", "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]", "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]", "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]", "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]", "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]", "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]", "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]", "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]", "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]", "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]");
const ToastContent = styledSlot(ToastPrimitive.Content, "toast-content", "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100");
const ToastTitle = styledSlot(ToastPrimitive.Title, "toast-title", "text-sm font-medium");
const ToastDescription = styledSlot(ToastPrimitive.Description, "toast-description", "text-sm text-muted-foreground");
function ToastAction({ className, render = defaultToastAction, ...props }) {
    return (_jsx(ToastPrimitive.Action, { "data-slot": "toast-action", render: render, className: cn("shrink-0", className), ...props }));
}
function ToastClose({ className, children, render = defaultToastClose, ...props }) {
    return (_jsx(ToastPrimitive.Close, { "data-slot": "toast-close", "aria-label": "Close toast", render: render, className: cn("relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground", className), ...props, children: children ?? _jsx(XIcon, { "aria-hidden": "true" }) }));
}
const toastIcons = {
    success: _jsx(CheckCircleIcon, { "aria-hidden": "true" }),
    info: _jsx(InfoIcon, { "aria-hidden": "true" }),
    warning: _jsx(WarningIcon, { "aria-hidden": "true" }),
    error: _jsx(XCircleIcon, { "aria-hidden": "true", className: "text-destructive" }),
    loading: _jsx(SpinnerIcon, { "aria-hidden": "true", className: "animate-spin" }),
};
function ToastIcon({ type }) {
    const icon = type && Object.hasOwn(toastIcons, type) ? toastIcons[type] : null;
    return icon ? (_jsx("span", { "data-slot": "toast-icon", className: "shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4", children: icon })) : null;
}
function ToastList() {
    const { toasts } = ToastPrimitive.useToastManager();
    return toasts.map((toastItem) => (_jsx(Toast, { toast: toastItem, children: _jsxs(ToastContent, { children: [_jsx(ToastIcon, { type: toastItem.type }), _jsxs("div", { className: "flex min-w-0 flex-1 flex-col gap-1", children: [_jsx(ToastTitle, {}), _jsx(ToastDescription, {})] }), _jsx(ToastAction, {}), _jsx(ToastClose, {})] }) }, toastItem.id)));
}
function Toaster({ children, toastManager = toast, ...props }) {
    return (_jsxs(ToastProvider, { toastManager: toastManager, ...props, children: [children, _jsx(ToastPortal, { children: _jsx(ToastViewport, { children: _jsx(ToastList, {}) }) })] }));
}
const createToastManager = ToastPrimitive.createToastManager;
const useToastManager = ToastPrimitive.useToastManager;
export { Toaster, Toast, ToastAction, ToastClose, ToastContent, ToastDescription, ToastPortal, ToastProvider, ToastTitle, ToastViewport, createToastManager, toast, useToastManager, };
//# sourceMappingURL=toast.js.map