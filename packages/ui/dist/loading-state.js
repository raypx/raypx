import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Skeleton } from "./components/ui/skeleton";
export function LoadingState({ label }) {
    return (_jsxs("div", { role: "status", className: "flex flex-col gap-5 py-8", children: [_jsx("span", { className: "text-sm text-muted-foreground", children: label }), _jsxs("div", { "aria-hidden": "true", className: "flex flex-col gap-4", children: [_jsx(Skeleton, { className: "h-7 w-48" }), [0, 1, 2].map((row) => (_jsx(Skeleton, { className: "h-16" }, row)))] })] }));
}
//# sourceMappingURL=loading-state.js.map