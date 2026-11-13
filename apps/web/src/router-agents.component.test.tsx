import { screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

const agents = vi.hoisted(() => ({ spaces: vi.fn(async () => []) }));
vi.mock("./features/agents/client.js", () => ({
  agentsClient: { spaces: { list: agents.spaces } },
}));
beforeEach(() => agents.spaces.mockClear());

it("redirects guests before private reads and preserves the validated conversation destination", async () => {
  const destination =
    "/agents?spaceId=11111111-1111-4111-8111-111111111111&agentId=22222222-2222-4222-8222-222222222222";
  const router = await page(destination);
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: destination });
  expect(agents.spaces).not.toHaveBeenCalled();
});

it("mounts the shared Agent workspace for a confirmed member without a deployment permission", async () => {
  signIn();
  await page("/agents");
  expect(await screen.findByRole("heading", { name: "Agents", level: 1 })).toBeVisible();
  await waitFor(() => expect(agents.spaces).toHaveBeenCalledOnce());
  expect(screen.getByRole("link", { name: "Projects" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Agents" })).toBeVisible();
});

it("does not mount private conversation reads while the session is unavailable", async () => {
  mocks.sessionError = true;
  mocks.loadAccount.mockResolvedValue({ status: "unavailable" });
  await page("/agents");
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(agents.spaces).not.toHaveBeenCalled();
});
