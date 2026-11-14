import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationClientFrame } from "@raypx/contracts/api";
import { agentIdSchema, type Conversation } from "@raypx/core/agents";
import {
  computerAvailabilityReasonSchema,
  type Computer,
  type SpaceComputer,
} from "@raypx/core/computers";
import { spaceIdSchema } from "@raypx/core/spaces";
import { ComputerController } from "./computer.js";
import { ConversationController } from "./controller.js";
import type { ComputerPort, ConversationSocketPort } from "./port.js";
import {
  computerConversationId,
  computerEvent,
  computerRecord,
  computerResult,
  computerSpaceId,
  computerTime,
  deferred,
} from "../../tests/support/computer-fixture.js";

const controllers: { dispose(): void }[] = [];

function fixture(initial: SpaceComputer = computerResult()) {
  const port: ComputerPort = {
    get: vi.fn(async () => initial),
    start: vi.fn(async () => computerResult("running")),
    stop: vi.fn(async () => computerResult("stopped")),
  };
  const controller = new ComputerController(computerSpaceId, port);
  controllers.push(controller);
  return { controller, port };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
});

describe("ComputerController", () => {
  it("keeps an admission reason when its state event races the response, then clears it on recovery", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const response = deferred<SpaceComputer>();
    vi.mocked(port.start).mockReturnValueOnce(response.promise);
    const starting = controller.start();
    vi.mocked(port.get).mockResolvedValue(computerResult("failed"));
    controller.applyEvent(computerEvent("failed"));
    response.resolve({
      status: "available",
      computer: computerRecord("failed"),
      unavailableReason: "SPACE_RUNNING_LIMIT",
    });
    expect(await starting).toBe(false);
    await controller.refresh();
    expect(controller.getSnapshot().unavailableReason).toBe("SPACE_RUNNING_LIMIT");
    vi.mocked(port.get).mockResolvedValue(computerResult("running"));
    await controller.refresh();
    expect(controller.getSnapshot().unavailableReason).toBeNull();
  });
  it.each(computerAvailabilityReasonSchema.options)(
    "retains %s after refused start and clears it on success",
    async (unavailableReason) => {
      const { controller, port } = fixture();
      await controller.refresh();
      vi.mocked(port.start).mockResolvedValueOnce({
        status: "available",
        computer: computerRecord("failed"),
        unavailableReason,
      });
      expect(await controller.start()).toBe(false);
      expect(controller.getSnapshot().unavailableReason).toBe(unavailableReason);
      expect(await controller.start()).toBe(true);
      expect(controller.getSnapshot().unavailableReason).toBeNull();
    },
  );
  it.each(["stopped", "starting", "running", "stopping", "failed"] as const)(
    "reads the Space's authoritative %s state without starting a computer",
    async (status) => {
      const { controller, port } = fixture(computerResult(status));
      expect(controller.getSnapshot().status).toBe("loading");
      await controller.refresh();
      expect(port.get).toHaveBeenCalledWith({ spaceId: computerSpaceId });
      expect(controller.getSnapshot()).toMatchObject({
        status,
        pending: null,
        refreshing: false,
        error: null,
        failureCode: status === "failed" ? "PROVIDER_UNAVAILABLE" : null,
      });
      expect(port.start).not.toHaveBeenCalled();
      expect(port.stop).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: "available", computer: null },
    computerResult("destroyed"),
  ] satisfies SpaceComputer[])(
    "shows an unallocated or destroyed computer as stopped",
    async (value) => {
      const { controller } = fixture(value);
      await controller.refresh();
      expect(controller.getSnapshot()).toMatchObject({ status: "stopped", failureCode: null });
    },
  );

  it("keeps not-configured explicit and refuses lifecycle commands", async () => {
    const { controller, port } = fixture({ status: "not-configured" });
    await controller.refresh();
    const confirm = vi.fn(async () => true);
    expect(controller.getSnapshot().status).toBe("not-configured");
    expect(await controller.start()).toBe(false);
    expect(await controller.stop(confirm)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(port.start).not.toHaveBeenCalled();
    expect(port.stop).not.toHaveBeenCalled();
  });

  it.each(["starting", "stopping"] as const)("blocks controls during %s", async (status) => {
    const { controller, port } = fixture(computerResult(status));
    await controller.refresh();
    expect(await controller.start()).toBe(false);
    expect(await controller.stop(async () => true)).toBe(false);
    expect(port.start).not.toHaveBeenCalled();
    expect(port.stop).not.toHaveBeenCalled();
  });

  it("starts once, blocks double activation and follows the returned state", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const result = deferred<SpaceComputer>();
    vi.mocked(port.start).mockReturnValueOnce(result.promise);
    const first = controller.start();
    expect(controller.getSnapshot().pending).toBe("start");
    expect(await controller.start()).toBe(false);
    expect(await controller.stop(async () => true)).toBe(false);
    expect(port.start).toHaveBeenCalledTimes(1);
    expect(port.start).toHaveBeenCalledWith({ spaceId: computerSpaceId });
    result.resolve(computerResult("running"));
    expect(await first).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: "running", pending: null });
    expect(await controller.start()).toBe(false);
  });

  it("retains a failed start's reason and allows one explicit retry", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    vi.mocked(port.start).mockResolvedValueOnce({
      status: "available",
      computer: { ...computerRecord("failed"), failureCode: "RESTORE_FAILED" },
    });
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      status: "failed",
      failureCode: "RESTORE_FAILED",
      pending: null,
    });
    await controller.start();
    expect(port.start).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({ status: "running", failureCode: null });
  });

  it("guards the entire stop confirmation and cancels without making a request", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const answer = deferred<boolean>();
    const confirm = vi.fn(() => answer.promise);
    const stopping = controller.stop(confirm);
    expect(controller.getSnapshot().pending).toBe("stop");
    expect(await controller.stop(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(port.stop).not.toHaveBeenCalled();
    answer.resolve(false);
    expect(await stopping).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ status: "running", pending: null });
    expect(port.stop).not.toHaveBeenCalled();
  });

  it("stops once after confirmation and blocks duplicate activation while stopping", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const result = deferred<SpaceComputer>();
    vi.mocked(port.stop).mockReturnValueOnce(result.promise);
    const stopping = controller.stop(async () => true);
    await Promise.resolve();
    expect(port.stop).toHaveBeenCalledWith({ spaceId: computerSpaceId });
    expect(await controller.stop(async () => true)).toBe(false);
    result.resolve(computerResult("stopped"));
    expect(await stopping).toBe(true);
    expect(port.stop).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ status: "stopped", pending: null });
  });

  it("releases a superseded event refresh when stop is confirmed and ignores its late read", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const answer = deferred<boolean>();
    const olderRead = deferred<SpaceComputer>();
    const result = deferred<SpaceComputer>();
    vi.mocked(port.get).mockReturnValueOnce(olderRead.promise);
    vi.mocked(port.stop).mockReturnValueOnce(result.promise);
    const stopping = controller.stop(() => answer.promise);
    controller.applyEvent(computerEvent("running"));
    expect(controller.getSnapshot()).toMatchObject({ pending: "stop", refreshing: true });
    answer.resolve(true);
    await Promise.resolve();
    expect(port.stop).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ pending: "stop", refreshing: false });
    result.resolve(computerResult("stopped"));
    expect(await stopping).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      status: "stopped",
      pending: null,
      refreshing: false,
    });
    olderRead.resolve(computerResult("running"));
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({
      status: "stopped",
      pending: null,
      refreshing: false,
    });
  });

  it("applies live state immediately and reads the failure reason missing from the event", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const result = deferred<SpaceComputer>();
    vi.mocked(port.get).mockReturnValueOnce(result.promise);
    controller.applyEvent(computerEvent("failed"));
    expect(controller.getSnapshot().status).toBe("failed");
    expect(port.get).toHaveBeenCalledTimes(2);
    result.resolve({
      status: "available",
      computer: { ...computerRecord("failed"), failureCode: "RESTORE_FAILED" },
    });
    await Promise.resolve();
    expect(controller.getSnapshot()).toMatchObject({
      status: "failed",
      failureCode: "RESTORE_FAILED",
    });
  });

  it("ignores a computer event from another Space", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const previous = controller.getSnapshot();
    controller.applyEvent({ ...computerEvent("running"), spaceId: spaceIdSchema.parse("other") });
    expect(controller.getSnapshot()).toBe(previous);
    expect(port.get).toHaveBeenCalledTimes(1);
  });

  it("does not let an older read overwrite a newer computer event", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const older = deferred<SpaceComputer>();
    const newer = deferred<SpaceComputer>();
    vi.mocked(port.get).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const refresh = controller.refresh();
    controller.applyEvent(computerEvent("running"));
    newer.resolve(computerResult("running"));
    await Promise.resolve();
    older.resolve(computerResult("stopped"));
    await refresh;
    expect(controller.getSnapshot().status).toBe("running");
  });

  it("fences a reconnect read captured while start was pending after start succeeds", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const result = deferred<SpaceComputer>();
    const olderRead = deferred<SpaceComputer>();
    vi.mocked(port.start).mockReturnValueOnce(result.promise);
    vi.mocked(port.get).mockReturnValueOnce(olderRead.promise);
    const starting = controller.start();
    const refresh = controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ pending: "start", refreshing: true });
    result.resolve(computerResult("running"));
    expect(await starting).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      status: "running",
      pending: null,
      refreshing: false,
    });
    olderRead.resolve(computerResult("stopped"));
    await refresh;
    expect(controller.getSnapshot()).toMatchObject({
      status: "running",
      pending: null,
      refreshing: false,
    });
  });

  it.each(["get", "start", "stop"] as const)(
    "makes a failed %s request retryable without exposing its diagnostic",
    async (method) => {
      const initial: Computer["state"] = method === "stop" ? "running" : "stopped";
      const { controller, port } = fixture(computerResult(initial));
      if (method !== "get") await controller.refresh();
      vi.mocked(port[method]).mockRejectedValueOnce(new Error("private provider credential"));
      if (method === "get") await controller.refresh();
      else if (method === "start") await controller.start();
      else await controller.stop(async () => true);
      expect(controller.getSnapshot()).toMatchObject({
        error: method === "get" ? "load" : method,
        pending: null,
        refreshing: false,
      });
      expect(JSON.stringify(controller.getSnapshot())).not.toContain("private provider credential");
      if (method === "get") await controller.refresh();
      else if (method === "start") await controller.start();
      else await controller.stop(async () => true);
      expect(controller.getSnapshot().error).toBeNull();
    },
  );

  it("ignores a stale generation and refuses a read for another Space", async () => {
    const { controller, port } = fixture({
      status: "available",
      computer: { ...computerRecord("running"), generation: 3 },
    });
    await controller.refresh();
    controller.applyEvent({ ...computerEvent("stopped"), generation: 2 });
    expect(controller.getSnapshot().status).toBe("running");
    expect(port.get).toHaveBeenCalledTimes(1);
    vi.mocked(port.get).mockResolvedValueOnce({
      status: "available",
      computer: { ...computerRecord("stopped"), spaceId: spaceIdSchema.parse("other") },
    });
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ status: "running", error: "load" });
  });

  it("does not stop if another member changes the state during confirmation", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const answer = deferred<boolean>();
    const stopping = controller.stop(() => answer.promise);
    vi.mocked(port.get).mockResolvedValueOnce(computerResult("stopped"));
    controller.applyEvent(computerEvent("stopped"));
    await Promise.resolve();
    answer.resolve(true);
    expect(await stopping).toBe(false);
    expect(port.stop).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ status: "stopped", pending: null });
  });

  it("ignores pending reads and commands after disposal", async () => {
    const { controller, port } = fixture();
    await controller.refresh();
    const result = deferred<SpaceComputer>();
    vi.mocked(port.start).mockReturnValueOnce(result.promise);
    const starting = controller.start();
    controller.dispose();
    const previous = controller.getSnapshot();
    result.resolve(computerResult("running"));
    expect(await starting).toBe(false);
    expect(controller.getSnapshot()).toBe(previous);
    expect(await controller.start()).toBe(false);
  });

  it("does not stop after the selected controller is disposed during confirmation", async () => {
    const { controller, port } = fixture(computerResult("running"));
    await controller.refresh();
    const answer = deferred<boolean>();
    const stopping = controller.stop(() => answer.promise);
    controller.dispose();
    answer.resolve(true);
    expect(await stopping).toBe(false);
    expect(port.stop).not.toHaveBeenCalled();
  });
});

describe("computer conversation convergence", () => {
  it("refreshes on initial connection and reconnect, and applies an ordered event before ACK", async () => {
    vi.useFakeTimers();
    const { controller: computer, port } = fixture();
    const connections: Parameters<ConversationSocketPort["connect"]>[0][] = [];
    const frames: ConversationClientFrame[] = [];
    const observed: string[] = [];
    const conversation: Conversation = {
      id: computerConversationId,
      spaceId: computerSpaceId,
      agentId: agentIdSchema.parse("computer-agent"),
      kind: "direct",
      createdAt: computerTime,
    };
    const controller = new ConversationController({
      selection: { spaceId: computerSpaceId, conversationId: computerConversationId },
      owner: { origin: "https://example.test", accountId: "member" },
      port: {
        snapshot: async () => ({ conversation, messages: [], runs: [], segments: [], cursor: 0 }),
        send: vi.fn(),
        stop: vi.fn(),
      },
      socket: {
        connect(callbacks) {
          connections.push(callbacks);
          return {
            close() {},
            send(frame) {
              frames.push(frame);
              if (frame.type === "ack") observed.push(computer.getSnapshot().status);
            },
          };
        },
      },
      drafts: { read: () => null, write() {}, remove() {} },
      key: () => "message-key",
      computer,
    });
    controllers.push(controller);
    await controller.start();
    connections[0]!.onFrame({ type: "ready", version: 1 });
    await Promise.resolve();
    expect(port.get).toHaveBeenCalledTimes(1);
    const read = deferred<SpaceComputer>();
    vi.mocked(port.get).mockReturnValueOnce(read.promise);
    connections[0]!.onFrame({ type: "event", entry: { event: computerEvent("running") } });
    expect(controller.getSnapshot().cursor).toBe(1);
    expect(observed).toEqual(["running"]);
    expect(frames.at(-1)).toMatchObject({ type: "ack", sequence: 1 });
    connections[0]!.onFrame({ type: "event", entry: { event: computerEvent("running") } });
    expect(port.get).toHaveBeenCalledTimes(2);
    read.resolve(computerResult("running"));
    await Promise.resolve();
    vi.mocked(port.get).mockResolvedValueOnce(computerResult("stopped"));
    connections[0]!.onClose(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    connections[1]!.onFrame({ type: "ready", version: 1 });
    await Promise.resolve();
    expect(port.get).toHaveBeenCalledTimes(3);
    expect(computer.getSnapshot().status).toBe("stopped");
    expect(frames.at(-1)).toMatchObject({ type: "subscribe", after: 1 });
  });
});
