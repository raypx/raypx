import { expect, it } from "vite-plus/test";
import { createApiClient } from "../src/index.js";

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
