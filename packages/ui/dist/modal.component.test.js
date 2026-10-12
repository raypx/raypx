import { jsx as _jsx } from "react/jsx-runtime";
/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Modal } from "./modal";
import { Button } from "./components/ui/button";
afterEach(cleanup);
it.each([false, true])("names the overlay, closes on Escape and restores its trigger (drawer=%s)", async (drawer) => {
    function Example() {
        const [open, setOpen] = useState(false);
        return (_jsx(Modal, { title: "Create a project", description: "Name the project", closeLabel: "Close", trigger: _jsx(Button, { children: "Open" }), open: open, onOpenChange: setOpen, drawer: drawer, children: _jsx("input", { "aria-label": "Project title", autoFocus: true }) }));
    }
    const user = userEvent.setup();
    render(_jsx(Example, {}));
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Create a project" })).toHaveAccessibleDescription("Name the project");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
});
it("keeps a pending form open until its caller finishes saving", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(_jsx(Modal, { title: "Create a project", closeLabel: "Close", trigger: _jsx(Button, { children: "Open" }), open: true, busy: true, onOpenChange: onOpenChange, children: _jsx("input", { "aria-label": "Project title", autoFocus: true }) }));
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
});
//# sourceMappingURL=modal.component.test.js.map