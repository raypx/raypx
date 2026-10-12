import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "./lib/utils";
/** A compact, neutral heading row for sections inside a page. */
export function SectionHeading({ title, titleId, description, action, className, }) {
    return (_jsxs("div", { className: cn("flex items-start justify-between gap-4", className), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h2", { id: titleId, className: "text-sm font-medium", children: title }), description ? _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: description }) : null] }), action] }));
}
//# sourceMappingURL=section-heading.js.map