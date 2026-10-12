import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { IconButton } from "./icon-button";
import { HelpHint } from "./help-hint";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger, } from "./components/ui/dropdown-menu";
afterEach(cleanup);
it("keeps refs, keyboard hints, native disabled behavior and safe form defaults", async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const action = vi.fn();
    const ref = createRef();
    const user = userEvent.setup();
    render(_jsxs("form", { onSubmit: submit, children: [_jsx(IconButton, { label: "Refresh", ref: ref, onClick: action, children: _jsx("svg", { "aria-hidden": "true" }) }), _jsx(IconButton, { label: "Saving", disabled: true, onClick: action, children: _jsx("svg", { "aria-hidden": "true" }) })] }));
    await user.tab();
    expect(ref.current).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Refresh");
    await user.keyboard("{Enter}");
    expect(action).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Saving" }));
    expect(action).toHaveBeenCalledOnce();
});
it("composes a menu trigger without losing its handlers, name or focus restoration", async () => {
    const user = userEvent.setup();
    render(_jsxs(DropdownMenu, { children: [_jsx(DropdownMenuTrigger, { render: _jsx(IconButton, { label: "Account", children: _jsx("svg", { "aria-hidden": "true" }) }) }), _jsx(DropdownMenuContent, { children: _jsx(DropdownMenuGroup, { children: _jsx(DropdownMenuItem, { children: "Preferences" }) }) })] }));
    const trigger = screen.getByRole("button", { name: "Account" });
    await user.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Preferences" })).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
});
it("opens help by click or keyboard and restores focus when dismissed", async () => {
    const user = userEvent.setup();
    render(_jsx(HelpHint, { label: "Sync behavior", description: "Saved locally. Sync is not connected yet." }));
    const trigger = screen.getByRole("button", { name: "Sync behavior" });
    expect(screen.queryByText("Saved locally. Sync is not connected yet.")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Sync behavior" })).toHaveAccessibleDescription("Saved locally. Sync is not connected yet.");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeVisible();
});
//# sourceMappingURL=utility-controls.component.test.js.map