import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle, Circle, Info, WarningCircle } from "@phosphor-icons/react";
import { Badge } from "./components/ui/badge";
import { cn } from "./lib/utils";
const toneConfig = {
    neutral: { icon: Circle, variant: "outline" },
    info: { icon: Info, variant: "secondary" },
    warning: { icon: WarningCircle, variant: "secondary" },
    success: { icon: CheckCircle, variant: "secondary" },
    danger: { icon: WarningCircle, variant: "destructive" },
};
export function StatusBadge({ label, tone = "neutral", className }) {
    const config = toneConfig[tone];
    const Icon = config.icon;
    return (_jsxs(Badge, { className: cn("shrink-0", className), variant: config.variant, children: [_jsx(Icon, { "aria-hidden": "true", "data-icon": "inline-start", weight: "bold" }), label] }));
}
//# sourceMappingURL=status-badge.js.map