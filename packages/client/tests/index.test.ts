import { expect, it } from "vite-plus/test";
import { createApiClient, isMissingProcedure } from "../src/index.js";

it("reads headers again after a credential change and always uses POST", async () => {
  let cookie = "session=first";
  const seen: Request[] = [];
  const client = createApiClient({
    baseUrl: "https://api.example.com/",
    headers: () => ({ cookie }),
    fetch: async (input, init) => {
      seen.push(new Request(input, init));
      return Response.json({ json: { id: "u1", email: "a@example.com", name: "A" } });
    },
  });
  await client.account.get({});
  cookie = "session=second";
  await client.account.get({});
  expect(seen.map((r) => r.headers.get("cookie"))).toEqual(["session=first", "session=second"]);
  expect(seen.map((r) => r.method)).toEqual(["POST", "POST"]);
  expect(seen[0]?.url).toBe("https://api.example.com/rpc/account/get");
});

it("recognizes old plain 404 responses without hiding authentication/server failures", async () => {
  for (const status of [404, 401, 503]) {
    const api = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => Response.json({ error: { code: "NOT_FOUND" } }, { status }),
    });
    const error = await api.hosts
      .authorize({ deviceId: crypto.randomUUID(), epoch: 1 })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(isMissingProcedure(error)).toBe(status === 404);
  }
});
