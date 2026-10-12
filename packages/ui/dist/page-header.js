import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "./lib/utils";
export function PageHeader({ title, description, action, className, }) {
    return (_jsxs("header", { className: cn("flex flex-wrap items-start justify-between gap-4", className), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h1", { className: "text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]", children: title }), description ? (_jsx("p", { className: "mt-2 max-w-xl text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]", children: description })) : null] }), action] }));
}
//# sourceMappingURL=page-header.js.map