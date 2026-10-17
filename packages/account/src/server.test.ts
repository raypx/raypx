import { describe, expect, it } from "vite-plus/test";
import { createAccountService } from "./server";

describe("account service", () => {
  it("resolves each request afresh and projects only public fields", async () => {
    let authenticated = true;
    const seen: Headers[] = [];
    const service = createAccountService({
      readSession: async (headers) => {
        seen.push(headers);
        return authenticated
          ? {
              user: {
                id: "u1",
                name: "Ada",
                email: "a@example.test",
                token: "private",
                roles: ["old-role"],
              },
            }
          : null;
      },
    });
    const headers = new Headers({ cookie: "session" });
    expect(await service.get(headers)).toEqual({ id: "u1", name: "Ada", email: "a@example.test" });
    authenticated = false;
    expect(await service.get(headers)).toBeNull();
    expect(seen).toEqual([headers, headers]);
  });
  it("leaves authentication failures to the composition root's error mapping", async () => {
    const service = createAccountService({
      readSession: async () => {
        throw new Error("session unavailable");
      },
    });
    await expect(service.get(new Headers())).rejects.toThrow("session unavailable");
  });
});
