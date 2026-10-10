import { expect, test } from "vite-plus/test";
import { sessionResponseSchema } from "../src/auth.js";

test("public session contracts strip credentials and accept anonymous state", () => {
  expect(sessionResponseSchema.parse({ user: null })).toEqual({ user: null });
  expect(
    sessionResponseSchema.parse({
      user: {
        id: "1",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: false,
        image: null,
        password: "secret",
      },
      session: { token: "secret" },
    }),
  ).toEqual({
    user: { id: "1", name: "Alice", email: "alice@example.com", emailVerified: false, image: null },
  });
  expect(() => sessionResponseSchema.parse({ user: { id: "1", email: "bad" } })).toThrow(/Invalid/);
});
