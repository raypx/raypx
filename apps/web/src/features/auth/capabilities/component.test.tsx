/** @vitest-environment jsdom */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { useAuthCapabilities } from "../capabilities";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/api-client", () => ({
  createWebApiClient: () => ({ auth: { capabilities: { get } } }),
}));

describe("public auth capabilities", () => {
  it("uses the unauthenticated typed procedure", async () => {
    get.mockResolvedValue({
      registrationAvailable: false,
      verificationEmailRequestAvailable: false,
      passwordResetRequestAvailable: true,
    });
    const { result } = renderHook(() => useAuthCapabilities());

    await waitFor(() => expect(result.current.registrationAvailable).toBe(false));
    expect(get).toHaveBeenCalledWith({});
  });

  it("updates the fail-open defaults when the request succeeds", async () => {
    const load = async () => ({
      registrationAvailable: false,
      verificationEmailRequestAvailable: false,
      passwordResetRequestAvailable: false,
    });
    const { result } = renderHook(() => useAuthCapabilities(load));

    expect(result.current.registrationAvailable).toBe(true);
    await waitFor(() => expect(result.current.registrationAvailable).toBe(false));
  });

  it("keeps forms available when the capability request fails", async () => {
    const load = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    const { result } = renderHook(() => useAuthCapabilities(load));

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(result.current.registrationAvailable).toBe(true);
    expect(result.current.passwordResetRequestAvailable).toBe(true);
  });
});
