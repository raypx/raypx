import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { Composer } from "./composer";
const labels = {
  label: "Input",
  placeholder: "Ask",
  submit: "Send",
  submitting: "Sending",
  failed: "Failed",
  hint: "Enter sends",
};
describe("composer keyboard contract", () => {
  it("does not send Enter while Chinese input composition is active", async () => {
    const submit = vi.fn(async () => {});
    render(<Composer value="研究" onValueChange={() => {}} onSubmit={submit} labels={labels} />);
    const input = screen.getByLabelText("Input");
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229 });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit).toHaveBeenCalledWith("研究");
  });
  it("keeps Shift+Enter for line breaks and prevents a duplicate in-flight send", async () => {
    let finish!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Composer value="draft" onValueChange={() => {}} onSubmit={submit} labels={labels} />);
    const input = screen.getByLabelText("Input");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(submit).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  });
});
