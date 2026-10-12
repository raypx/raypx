import { describe, expect, it, vi } from "vite-plus/test";
vi.mock("../env", () => ({ env: { VITE_API_URL: "https://api.example.test" } }));
import { sessionHeaders } from "./session-headers";
import { createWebApiClient } from "./api-client";
describe("SSR transport isolation", () => {
  it("whitelists only session cookies", () => {
    expect(
      sessionHeaders(
        new Headers({
          cookie:
            "theme=dark; better-auth.session_token=a; __Secure-better-auth.session_data.0=b; analytics=ignore",
          authorization: "ignore",
          host: "untrusted.test",
        }),
      ),
    ).toEqual({ cookie: "better-auth.session_token=a; __Secure-better-auth.session_data.0=b" });
    expect(sessionHeaders(new Headers())).toEqual({});
  });
  it("keeps concurrent client cookie closures, cancellation, and configured origins isolated", async () => {
    const seen: Array<{ url: string; cookie: string | null; aborted: boolean }> = [];
    const controllers = [new AbortController(), new AbortController()];
    const clients = ["a", "b"].map((cookie, index) =>
      createWebApiClient({
        headers: sessionHeaders(new Headers({ cookie: `better-auth.session_token=${cookie}` })),
        fetch: async (input, init) => {
          const request = new Request(input, init);
          seen.push({
            url: request.url,
            cookie: request.headers.get("cookie"),
            aborted: request.signal.aborted,
          });
          controllers[index]!.abort();
          expect(request.signal.aborted).toBe(true);
          return new Response(null, { status: 503 });
        },
      }),
    );
    await Promise.allSettled(
      clients.map((client, index) =>
        client.projects.list({ limit: 50 }, { signal: controllers[index]!.signal }),
      ),
    );
    expect(seen.map((item) => item.cookie)).toEqual([
      "better-auth.session_token=a",
      "better-auth.session_token=b",
    ]);
    expect(seen.every((item) => !item.url.includes("untrusted") && !item.aborted)).toBe(true);
  });
});
