import { Button, ConnectionStatus } from "@raypx/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

test("a button defaults to type button and forwards clicks", () => {
  const onClick = vi.fn<() => void>();
  render(<Button onClick={onClick}>Retry Connection</Button>);
  const button = screen.getByRole("button", { name: "Retry Connection" });

  expect(button.getAttribute("type")).toBe("button");
  fireEvent.click(button);

  expect(onClick).toHaveBeenCalledOnce();
});

test("a disabled button retains native disabled behavior", () => {
  const onClick = vi.fn<() => void>();
  render(
    <Button disabled onClick={onClick}>
      Retry Connection
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Retry Connection" });

  expect(button.hasAttribute("disabled")).toBe(true);
  fireEvent.click(button);

  expect(onClick).not.toHaveBeenCalled();
});

test("a button accepts the native submit type", () => {
  render(<Button type="submit">Submit</Button>);

  expect(screen.getByRole("button", { name: "Submit" }).getAttribute("type")).toBe("submit");
});

test.each([
  ["loading", "Connecting to backend…"],
  ["connected", "Backend connected"],
  ["error", "Cannot connect to backend, please confirm API service is running."],
] as const)("connection status announces the %s state", (status, message) => {
  render(<ConnectionStatus status={status} />);
  const output = screen.getByRole("status");

  expect(output.tagName).toBe("OUTPUT");
  expect(output.textContent).toBe(message);
});
