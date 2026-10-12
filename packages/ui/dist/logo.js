import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import markUrl from "./assets/voidmix-mark.webp?url";
import { cn } from "./lib/utils";
export function Logo({ label = "Voidmix", className, ...props }) {
    return (_jsxs("span", { className: cn("inline-flex items-center gap-2 font-semibold tracking-tight", className), "data-slot": "logo", ...props, children: [_jsx("img", { alt: "", "aria-hidden": "true", className: "size-7 shrink-0 object-contain", "data-slot": "logo-mark", height: 28, src: markUrl, width: 28 }), _jsx("span", { children: label })] }));
}
//# sourceMappingURL=logo.js.map