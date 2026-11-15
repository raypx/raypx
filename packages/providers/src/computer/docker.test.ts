import { expect, it, vi } from "vitest";
import { createDockerComputerProvider, testDockerComputerConnection } from "./docker.js";

const options = {
  url: "https://supervisor.example.test",
  token: "fake-supervisor-credential-32-characters",
};
const description = {
  execution: "isolated-process",
  files: true,
  home: true,
  egress: "restricted",
  unenforced: [],
  screen: true,
  hosting: { untrustedTenants: true, runtime: "runsc" },
};

it("tests authenticated, bounded, redirect-free supervisor descriptions without returning their text", async () => {
  const request = vi.fn(async (_request: Request) => Response.json(description));
  expect(await testDockerComputerConnection({ ...options, fetch: request })).toEqual({
    status: "connected",
    untrustedTenants: true,
    runtime: "runsc",
    screen: true,
  });
  const sent = request.mock.calls[0]![0];
  expect(sent.url).toBe(`${options.url}/description`);
  expect(sent.redirect).toBe("error");
  expect(sent.headers.get("authorization")).toBe(`Bearer ${options.token}`);
  expect(
    await createDockerComputerProvider({ ...options, fetch: request }).describe(),
  ).toMatchObject({ screen: true, hosting: description.hosting });
});
it.each([401, 403, 500, 302])("reports status %s without echoing any body", async (status) => {
  const result = await testDockerComputerConnection({
    ...options,
    fetch: async () => new Response("fake-private-diagnostic", { status }),
  });
  expect(result).toEqual({
    status: status === 401 || status === 403 ? "authentication-failed" : "unavailable",
  });
  expect(JSON.stringify(result)).not.toContain("fake-private-diagnostic");
});
it("bounds both response headers and silent response bodies", async () => {
  expect(
    await testDockerComputerConnection({
      ...options,
      timeoutMs: 10,
      fetch: () => new Promise(() => {}),
    }),
  ).toEqual({ status: "timeout" });
  expect(
    await testDockerComputerConnection({
      ...options,
      timeoutMs: 10,
      fetch: async () => new Response(new ReadableStream()),
    }),
  ).toEqual({ status: "timeout" });
});
it("refuses oversized and unsupported descriptions", async () => {
  for (const body of [
    "x".repeat(17 * 1024),
    JSON.stringify({ ...description, hosting: undefined }),
  ])
    expect(
      await testDockerComputerConnection({ ...options, fetch: async () => new Response(body) }),
    ).toEqual({ status: "unavailable" });
});

it("reduces arbitrary runtime names to a safe classification", async () => {
  expect(
    await testDockerComputerConnection({
      ...options,
      fetch: async () =>
        Response.json({
          ...description,
          hosting: { untrustedTenants: false, runtime: options.token },
        }),
    }),
  ).toEqual({ status: "connected", untrustedTenants: false, runtime: "other", screen: true });
});
