import { describe, expect, it } from "vitest";
import {
  deviceConnectorClientFrameSchema,
  deviceConnectorPayloadIdentity,
  deviceConnectorRequestSchema,
  deviceConnectorServerFrameSchema,
  devicePairingClaimSchema,
} from "./device-connector.js";
const request = {
  operationId: "op",
  payloadHash: "a".repeat(64),
  deviceId: "d",
  accountId: "a",
  requesterAccountId: "a",
  spaceId: "s",
  grantId: "g",
  grantRevision: 1,
  connectionFence: 1,
  runId: "r",
  runFence: 1,
  expiresAt: "2026-11-14T05:00:00.000Z",
  operation: {
    kind: "execute" as const,
    executable: "/bin/echo",
    argv: ["a"],
    cwd: ".",
    environment: {},
    outputBudget: 10,
    approved: true as const,
  },
};
describe("device computer channel contract", () => {
  it("requires its own exact version without accepting retained Relay frames", () => {
    expect(
      devicePairingClaimSchema.safeParse({
        protocolVersion: 2,
        code: "12345678",
        deviceName: "machine",
      }).success,
    ).toBe(true);
    expect(
      devicePairingClaimSchema.safeParse({
        protocolVersion: 5,
        code: "12345678",
        deviceName: "machine",
      }).success,
    ).toBe(false);
    expect(
      deviceConnectorClientFrameSchema.safeParse({
        type: "hello",
        protocolVersion: 5,
        deviceId: "d",
        cursor: 0,
      }).success,
    ).toBe(false);
  });
  it("binds commands to owner/grant and both fences, including explicit command approval", () => {
    expect(deviceConnectorRequestSchema.parse(request)).toEqual(request);
    expect(
      deviceConnectorRequestSchema.safeParse({
        ...request,
        operation: { ...request.operation, approved: false },
      }).success,
    ).toBe(false);
    expect(deviceConnectorRequestSchema.safeParse({ ...request, runFence: 0 }).success).toBe(false);
    expect(deviceConnectorRequestSchema.safeParse({ ...request, connectionFence: 0 }).success).toBe(
      false,
    );
  });
  it("keeps operation identity stable across attempts but exact for arguments and grant revision", () => {
    const identity = deviceConnectorPayloadIdentity(request);
    expect(
      deviceConnectorPayloadIdentity({
        ...request,
        operation: { ...request.operation, environment: {} },
      }),
    ).toBe(identity);
    expect(deviceConnectorPayloadIdentity({ ...request, grantRevision: 2 })).not.toBe(identity);
    expect(
      deviceConnectorPayloadIdentity({
        ...request,
        operation: { ...request.operation, argv: ["b"] },
      }),
    ).not.toBe(identity);
  });
  it("bounds streamed output frames and rejects unknown fields", () => {
    expect(
      deviceConnectorClientFrameSchema.safeParse({
        type: "event",
        connectionFence: 1,
        operationId: "o",
        sequence: 1,
        event: { kind: "stdout", bytes: "a".repeat(44_004) },
      }).success,
    ).toBe(false);
    expect(
      deviceConnectorServerFrameSchema.safeParse({
        type: "cancel",
        connectionFence: 1,
        operationId: "o",
        token: "secret",
      }).success,
    ).toBe(false);
  });
});

it("refuses protocol v1 rather than degrading protected delivery", () => {
  expect(
    deviceConnectorClientFrameSchema.safeParse({
      type: "hello",
      protocolVersion: 1,
      deviceId: "device",
      cursor: 0,
    }).success,
  ).toBe(false);
});

it("binds the protected destination while excluding value changes from durable receipt identity", () => {
  const destination = { kind: "environment" as const, variable: "TOKEN" };
  function identity(value: string, variable = "TOKEN") {
    return deviceConnectorPayloadIdentity({
      ...request,
      operation: {
        ...request.operation,
        protectedInput: { destination: { ...destination, variable }, value },
      },
    });
  }
  expect(identity("first-value")).toBe(identity("different-value"));
  expect(identity("first-value", "OTHER")).not.toBe(identity("first-value"));
  expect(identity("first-value").includes("first-value")).toBe(false);
});
