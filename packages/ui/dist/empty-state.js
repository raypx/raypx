import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, } from "./components/ui/empty";
import { cn } from "./lib/utils";
export function EmptyState({ title, description, action, icon, className, }) {
    return (_jsxs(Empty, { className: cn("py-12", className), children: [_jsxs(EmptyHeader, { children: [icon ? _jsx(EmptyMedia, { variant: "icon", children: icon }) : null, _jsx(EmptyTitle, { children: _jsx("h2", { children: title }) }), _jsx(EmptyDescription, { children: description })] }), action ? _jsx(EmptyContent, { children: action }) : null] }));
}
//# sourceMappingURL=empty-state.js.map