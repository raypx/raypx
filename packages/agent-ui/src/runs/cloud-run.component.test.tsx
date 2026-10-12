import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { CloudRunControls, CloudRunTimeline, type CloudRunLabels } from "./cloud-run";
const labels: CloudRunLabels = {
  status: {
    queued: "Queued",
    running: "Running",
    needs_input: "Needs input",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
  },
  cancel: "Cancel",
  pending: "Waiting for confirmation",
  retry: "Retry",
  loading: "Loading",
  failed: "Could not load",
  input: "Input",
  output: "Output",
  execution: "Execution",
};
it("loads a large tool output only after expansion", async () => {
  const loadToolDetail = vi.fn(async () => ({
    input: { path: "table.csv" },
    output: "large output",
  }));
  const { container } = render(
    <CloudRunTimeline
      items={[
        {
          id: "event-1",
          kind: "tool",
          tool: { id: "tool-1", name: "compute_table", status: "succeeded" },
        },
      ]}
      capabilities={{ loadToolDetail }}
      labels={labels}
    />,
  );
  expect(loadToolDetail).not.toHaveBeenCalled();
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(loadToolDetail).toHaveBeenCalledWith("tool-1"));
  expect(await screen.findByText("large output")).toBeInTheDocument();
});
describe("durable cancellation presentation", () => {
  it("keeps the run running while a cancel awaits acknowledgement", () => {
    render(<CloudRunControls status="running" cancelPending onCancel={() => {}} labels={labels} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waiting for confirmation" })).toBeDisabled();
  });
  it("does not offer cancellation or retry for a completed result", () => {
    render(
      <CloudRunControls
        status="succeeded"
        onCancel={() => {}}
        onRetry={() => {}}
        labels={labels}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
it("refreshes an expanded partial tool result on completion and ignores an older response", async () => {
  let resolvePartial!: (value: { input: unknown; output: unknown }) => void;
  const partial = new Promise<{ input: unknown; output: unknown }>((resolve) => {
    resolvePartial = resolve;
  });
  const loadToolDetail = vi
    .fn()
    .mockImplementationOnce(() => partial)
    .mockResolvedValueOnce({ input: {}, output: "completed output" });
  const item = (status: "running" | "succeeded") => [
    { id: "event-1", kind: "tool" as const, tool: { id: "tool-1", name: "compute_table", status } },
  ];
  const capabilities = { loadToolDetail };
  const { container, rerender } = render(
    <CloudRunTimeline items={item("running")} capabilities={capabilities} labels={labels} />,
  );
  const details = container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(loadToolDetail).toHaveBeenCalledTimes(1));
  rerender(
    <CloudRunTimeline items={item("succeeded")} capabilities={capabilities} labels={labels} />,
  );
  expect(await screen.findByText("completed output")).toBeInTheDocument();
  resolvePartial({ input: {}, output: "stale partial output" });
  await partial;
  expect(screen.queryByText("stale partial output")).not.toBeInTheDocument();
});
