import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Button } from "./components/ui/button";
import { StatusBadge } from "./status-badge";
import { Modal } from "./modal";
afterEach(cleanup);
it("keeps native button defaults, disabled behavior and React 19 refs", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const ref = createRef();
    const user = userEvent.setup();
    render(_jsxs("form", { onSubmit: submit, children: [_jsx(Button, { ref: ref, children: "Open" }), _jsx(Button, { type: "submit", children: "Save" }), _jsx(Button, { type: "submit", disabled: true, children: "Unavailable" })] }));
    expect(ref.current).toBe(screen.getByRole("button", { name: "Open" }));
    await user.click(ref.current);
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Unavailable" }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledOnce();
});
it("composes a shadcn trigger with Base UI focus restoration", async () => {
    function Example() {
        const [open, setOpen] = useState(false);
        return (_jsx(Modal, { title: "Create project", closeLabel: "Close", open: open, onOpenChange: setOpen, trigger: _jsx(Button, { children: "New project" }), children: _jsx("input", { "aria-label": "Title", autoFocus: true }) }));
    }
    const user = userEvent.setup();
    render(_jsx(Example, {}));
    const trigger = screen.getByRole("button", { name: "New project" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Create project");
    expect(screen.getByRole("textbox")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
});
it("renders a visible translated badge on the first render and updates its label", async () => {
    const { rerender } = render(_jsx(StatusBadge, { tone: "neutral", label: "\u8349\u7A3F" }));
    expect(screen.getByText("草稿")).toBeVisible();
    rerender(_jsx(StatusBadge, { tone: "success", label: "\u5DF2\u4EA4\u4ED8" }));
    await waitFor(() => expect(screen.getByText("已交付")).toBeVisible());
});
//# sourceMappingURL=composition.component.test.js.map