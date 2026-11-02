import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { PasswordInput } from "./password-input";

afterEach(cleanup);
const labels = { show: "Show password", hide: "Hide password" };

it("reveals and hides the same input without changing its value or submitting", async () => {
  const submit = vi.fn((event) => event.preventDefault());
  const ref = createRef<HTMLInputElement>();
  const user = userEvent.setup();
  render(
    <form onSubmit={submit}>
      <label htmlFor="password">Password</label>
      <PasswordInput
        id="password"
        name="password"
        ref={ref}
        labels={labels}
        autoComplete="current-password"
        required
      />
    </form>,
  );
  const input = screen.getByLabelText("Password");
  expect(input).toHaveAttribute("type", "password");
  expect(ref.current).toBe(input);
  await user.type(input, "example-password");
  const toggle = screen.getByRole("button", { name: "Show password" });
  expect(toggle).toHaveAttribute("aria-controls", "password");
  await user.click(toggle);
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveValue("example-password");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle).toHaveAccessibleName("Hide password");
  await user.click(toggle);
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveValue("example-password");
  expect(input).toHaveAttribute("autocomplete", "current-password");
  expect(new FormData(input.closest("form")!).get("password")).toBe("example-password");
  expect(submit).not.toHaveBeenCalled();
});

it("supports translated labels and keyboard toggling", async () => {
  const user = userEvent.setup();
  render(<PasswordInput aria-label="密码" labels={{ show: "显示密码", hide: "隐藏密码" }} />);
  await user.tab();
  expect(screen.getByLabelText("密码")).toHaveFocus();
  await user.tab();
  const toggle = screen.getByRole("button", { name: "显示密码" });
  expect(toggle).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByLabelText("密码")).toHaveAttribute("type", "text");
  expect(toggle).toHaveAccessibleName("隐藏密码");
  await user.keyboard(" ");
  expect(screen.getByLabelText("密码")).toHaveAttribute("type", "password");
});

it("keeps controlled updates and disables both the input and toggle", async () => {
  const change = vi.fn();
  const { rerender } = render(
    <PasswordInput aria-label="Password" labels={labels} value="first" onChange={change} />,
  );
  const input = screen.getByLabelText("Password");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Show password" }));
  rerender(
    <PasswordInput
      aria-label="Password"
      labels={labels}
      value="second"
      onChange={change}
      disabled
    />,
  );
  expect(input).toHaveValue("second");
  expect(input).toBeDisabled();
  const toggle = screen.getByRole("button", { name: "Hide password" });
  expect(toggle).toBeDisabled();
  await user.click(toggle);
  expect(input).toHaveAttribute("type", "text");
  expect(change).not.toHaveBeenCalled();
});
