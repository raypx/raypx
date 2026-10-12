import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { EmptyState } from "./empty-state";
import { StatusBadge } from "./status-badge";
import { SectionHeading } from "./section-heading";
import { Switch } from "./components/ui/switch";
describe("shared UI patterns", () => {
    it("supports labelled switch state changes and disabled state", () => {
        const onCheckedChange = vi.fn();
        render(_jsx(Switch, { "aria-label": "Sync automatically", checked: false, onCheckedChange: onCheckedChange }));
        const control = screen.getByRole("switch", { name: "Sync automatically" });
        expect(control).not.toBeChecked();
        fireEvent.click(control);
        expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
        expect(control).not.toBeDisabled();
    });
    it("communicates state with text and provides an actionable empty state", () => {
        render(_jsxs(_Fragment, { children: [_jsx(StatusBadge, { label: "Blocked", tone: "danger" }), _jsx(EmptyState, { title: "Start a project", description: "Keep your work together", action: _jsx("button", { type: "button", children: "Create project" }) })] }));
        expect(screen.getByText("Blocked")).toBeVisible();
        expect(screen.getByRole("button", { name: "Create project" })).toBeVisible();
        expect(screen.getByText("Blocked")).toHaveAttribute("data-slot", "badge");
        expect(screen.getByText("Blocked").querySelector("svg")).toHaveAttribute("data-icon", "inline-start");
    });
    it("renders a labelled section with optional description and action", () => {
        render(_jsx(SectionHeading, { title: "Recent activity", description: "The latest workspace changes", action: _jsx("button", { type: "button", children: "View all" }) }));
        expect(screen.getByRole("heading", { level: 2, name: "Recent activity" })).toBeVisible();
        expect(screen.getByText("The latest workspace changes")).toBeVisible();
        expect(screen.getByRole("button", { name: "View all" })).toBeVisible();
    });
});
//# sourceMappingURL=patterns.component.test.js.map