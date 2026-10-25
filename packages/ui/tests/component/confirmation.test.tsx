/** @vitest-environment jsdom */
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import { useConfirmation } from "../../src/confirmation";
import { Button } from "../../src/components/ui/button";

const options = {
  title: "Delete automation",
  description: "Nightly scan will be removed.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
};

it("focuses Cancel, supports Escape and returns focus before another explicit confirmation", async () => {
  const user = userEvent.setup();
  const answer = vi.fn();
  function Example() {
    const { confirm, dialog } = useConfirmation();
    return (
      <>
        <Button onClick={() => void confirm(options).then(answer)}>Remove automation</Button>
        {dialog}
      </>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Remove automation" });
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog", { name: "Delete automation" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
  await user.keyboard("[Escape]");
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith(false));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
  );
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith(true));
  expect(answer).toHaveBeenCalledTimes(2);
});

it("queues overlapping requests, shares an explicit identity and cancels all on unmount", async () => {
  const { result, unmount } = renderHook(() => useConfirmation());
  let first!: Promise<boolean>;
  act(() => {
    first = result.current.confirm({ ...options, requestKey: "first" });
  });
  expect(result.current.confirm({ ...options, requestKey: "first" })).toBe(first);
  const second = result.current.confirm(options);
  unmount();
  await expect(first).resolves.toBe(false);
  await expect(second).resolves.toBe(false);
});
it("asks for a separate answer to each queued request", async () => {
  const user = userEvent.setup(),
    answers = vi.fn();
  function Example() {
    const { confirm, dialog } = useConfirmation();
    return (
      <>
        <Button
          onClick={() => {
            void confirm(options).then(answers);
            void confirm({ ...options, title: "Leave page" }).then(answers);
          }}
        >
          Start
        </Button>
        {dialog}
      </>
    );
  }
  render(<Example />);
  await user.click(screen.getByRole("button", { name: "Start" }));
  await user.click(
    within(await screen.findByRole("alertdialog", { name: options.title })).getByRole("button", {
      name: "Delete",
    }),
  );
  const next = await screen.findByRole("alertdialog", { name: "Leave page" });
  expect(answers).toHaveBeenCalledTimes(1);
  await user.click(within(next).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(answers.mock.calls).toEqual([[true], [false]]));
});
