import { vi } from "vitest";
import { computerScreenFrameSchema, type ComputerScreenState } from "@raypx/core/computers";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import {
  ComputerScreenController,
  type ComputerScreenPort,
} from "../../src/model/computer-screen.js";
import type { ConversationSocketPort } from "../../src/model/port.js";
import { computerSpaceId, deferred } from "./computer-fixture.js";

export function screenFixture() {
  let state: ComputerScreenState = {
    status: "available",
    running: true,
    width: 640,
    height: 480,
    control: null,
    agentInputPaused: false,
    canForceRelease: true,
  };
  const grantId = "02f902b9-08db-426b-a0c1-5493f9b74509";
  const viewerId = "eaf2c75d-bb7b-42c9-8b26-9b9801822461";
  const changed = (
    control: Extract<ComputerScreenState, { status: "available" }>["control"],
  ): ComputerScreenState => ({
    ...(state as Extract<ComputerScreenState, { status: "available" }>),
    control,
    agentInputPaused: control !== null,
  });
  const port: ComputerScreenPort = {
    screenAvailability: vi.fn(async () => state),
    startScreen: vi.fn(
      async () =>
        (state = {
          ...(state as Extract<ComputerScreenState, { status: "available" }>),
          running: true,
        }),
    ),
    stopScreen: vi.fn(
      async () =>
        (state = {
          ...(state as Extract<ComputerScreenState, { status: "available" }>),
          running: false,
          control: null,
          agentInputPaused: false,
        }),
    ),
    acquireControl: vi.fn(
      async () =>
        (state = changed({
          id: grantId,
          accountId: "member",
          displayName: "Member",
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        })),
    ),
    renewControl: vi.fn(async () => state),
    releaseControl: vi.fn(async () => (state = changed(null))),
    forceReleaseControl: vi.fn(async () => (state = changed(null))),
    screenInput: vi.fn(async () => ({ accepted: true as const })),
  };
  let callbacks!: Parameters<ConversationSocketPort["connect"]>[0];
  const socket = { send: vi.fn(), close: vi.fn() };
  const sockets: ConversationSocketPort = {
    connect: vi.fn((next) => {
      callbacks = next;
      return socket;
    }),
  };
  const controller = new ComputerScreenController(
    computerSpaceId,
    "member",
    port,
    sockets,
    () => viewerId,
  );
  let sequence = 0;
  function emit(event: Extract<ConversationServerFrame, { type: "screen.event" }>["event"]) {
    callbacks.onFrame({
      type: "screen.event",
      spaceId: computerSpaceId,
      viewerId,
      sequence: ++sequence,
      event,
    });
  }
  const frame = computerScreenFrameSchema.parse({
    sequence: 1,
    width: 640,
    height: 480,
    mimeType: "image/png",
    bytes:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfR0AAAAASUVORK5CYII=",
  });
  return {
    controller,
    port,
    sockets,
    socket,
    frame,
    grantId,
    viewerId,
    emit,
    ready: () => callbacks.onFrame({ type: "ready", version: 1 }),
    state: () => state,
    setState: (next: ComputerScreenState) => {
      state = next;
    },
    close: (reason = "SPACE_MEMBER_REMOVED") => callbacks.onClose(4003, reason),
    deferred,
  };
}
