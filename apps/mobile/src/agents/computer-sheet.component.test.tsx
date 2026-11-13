import { describe, expect, it, vi } from "vitest";
import { act } from "react-test-renderer";
import type { AlertButton } from "react-native";
import { Alert } from "../../tests/mocks/react-native.js";
import { ComputerController, type ComputerPort } from "@raypx/agents/model";
import { computerSchema, type SpaceComputer } from "@raypx/core/computers";
import { spaceIdSchema } from "@raypx/core/spaces";
import { findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { ComputerIndicator, ComputerSheet } from "./computer-sheet.js";

const spaceId = spaceIdSchema.parse("space-1");

function available(state: "stopped" | "running" | "starting" | "failed"): SpaceComputer {
  return {
    status: "available",
    computer: computerSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      spaceId,
      scope: "team",
      agentId: null,
      provider: "memory",
      state,
      generation: 1,
      homeRevision: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseFence: 0,
      failureCode: state === "failed" ? "RESTORE_FAILED" : null,
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    }),
  };
}

function fixture(initial: SpaceComputer) {
  const port: ComputerPort = {
    get: vi.fn(async () => initial),
    start: vi.fn(async () => available("running")),
    stop: vi.fn(async () => available("stopped")),
  };
  return { controller: new ComputerController(spaceId, port), port };
}

describe("native computer sheet", () => {
  it("shows not configured without lifecycle controls and exposes a labelled indicator", async () => {
    const { controller, port } = fixture({ status: "not-configured" });
    await controller.refresh();
    const open = vi.fn();
    const view = await renderNative(
      <>
        <ComputerIndicator state={controller.getSnapshot()} open={false} onOpen={open} />
        <ComputerSheet controller={controller} open onClose={vi.fn()} />
      </>,
    );
    expect(textContent(view.root)).toContain("Not configured on this server");
    await press(findByLabel(view.root, "Computer: Not configured on this server"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(view.root.findAllByProps({ accessibilityLabel: "Start computer" })).toHaveLength(0);
    expect(view.root.findAllByProps({ accessibilityLabel: "Stop computer" })).toHaveLength(0);
    expect(port.start).not.toHaveBeenCalled();
    await view.unmount();
    controller.dispose();
  });

  it("starts the current Space computer and confirms stop before sending a command", async () => {
    const { controller, port } = fixture(available("stopped"));
    await controller.refresh();
    const view = await renderNative(
      <ComputerSheet controller={controller} open onClose={vi.fn()} />,
    );
    await press(findByLabel(view.root, "Start computer"));
    expect(port.start).toHaveBeenCalledWith({ spaceId });
    expect(textContent(view.root)).toContain("Running");
    await press(findByLabel(view.root, "Stop computer"));
    expect(port.stop).not.toHaveBeenCalled();
    const buttons = Alert.alert.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
    expect(buttons?.map((button) => button.text)).toEqual(["Cancel", "Stop computer"]);
    await act(async () => buttons?.[0]?.onPress?.());
    expect(port.stop).not.toHaveBeenCalled();
    await press(findByLabel(view.root, "Stop computer"));
    const accepted = Alert.alert.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
    await act(async () => accepted?.[1]?.onPress?.());
    expect(port.stop).toHaveBeenCalledTimes(1);
    expect(port.stop).toHaveBeenCalledWith({ spaceId });
    expect(textContent(view.root)).toContain("Stopped");
    await view.unmount();
    controller.dispose();
  });

  it("shows the restore failure and permits an explicit retry", async () => {
    const { controller, port } = fixture(available("failed"));
    await controller.refresh();
    const view = await renderNative(
      <ComputerSheet controller={controller} open onClose={vi.fn()} />,
    );
    expect(textContent(view.root)).toContain("The computer home could not be restored");
    await press(findByLabel(view.root, "Retry start"));
    expect(port.start).toHaveBeenCalledTimes(1);
    await view.unmount();
    controller.dispose();
  });
});
